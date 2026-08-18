# Provisioning de la machine de traitement

Ce playbook installe ce que la machine de traitement doit porter pour `qf-batch`
([worker/src/scripts/qf-batch.ts](../../worker/src/scripts/qf-batch.ts)) et le passage
FranceConnect
([data/2026/partners/franceconnect/run_fc_pipeline.sh](../../data/2026/partners/franceconnect/run_fc_pipeline.sh)) :
paquets système, CLI Scalingo, Node par apt/NodeSource, le virtualenv `data/.venv` et son kernel Jupyter,
`/etc/default/pass-sport-fc`, l'unité systemd `qf-batch@` et l'entrée crontab de FC.

`lamp-setup.yml` n'est qu'un sommaire : il définit les variables et importe, dans l'ordre où
elles sont jouées, les tâches réparties par sujet dans [tasks/](tasks/) (comptes, paquets,
propriété du dépôt, CLI Scalingo, Node, virtualenv, configuration, droits du groupe,
ordonnancement) — les commentaires détaillés de chaque tâche vivent dans son propre fichier.

## Le groupe d'exploitation

La campagne s'exploite à deux. Un groupe Unix `passsport` réunit trois comptes :

| Compte | Rôle |
|---|---|
| `passsport` | compte de service : exécute l'unité `qf-batch@` et la cron FC, possède les fichiers |
| `<opérateur 1>` | humain |
| `<opérateur 2>` | humain |

Les noms des deux comptes humains ne sont **pas** dans ce dépôt, qui est public. Ils se
déclarent dans `~/pass-sport-secrets.yml`, à côté des secrets :

```yaml
pass_sport_operators: [<compte1>, <compte2>]
```

### Les opérateurs ne deviennent jamais `passsport`

Chacun travaille **sous son propre compte** : `git pull`, notebooks, lecture et écriture des
CSV, journaux, passage FC à la main. L'accès passe par les bits de groupe, pas par le
propriétaire des fichiers — qui devient donc sans importance.

Le seul `sudo` est celui du `systemctl start`, et il ne fait pas *devenir* `passsport` : il
exécute une commande précise en tant que root, laquelle démarre l'unité, qui bascule ensuite
d'elle-même sur `passsport` par son `User=`. `sudo su passsport` est d'ailleurs refusé — le
fichier sudoers n'accorde que les trois `systemctl`.

C'est délibéré : si tout le monde travaillait sous le compte de service, on perdrait la trace
de qui a fait quoi.

### Ce que le groupe peut faire

| Action | Commande | sudo ? |
|---|---|---|
| Lancer un passage | `sudo systemctl start pass-sport-qf-batch@msa` | oui |
| L'arrêter, le relancer | `sudo systemctl stop\|restart pass-sport-qf-batch@msa` | oui |
| Voir son état | `systemctl status pass-sport-qf-batch@msa` | non |
| Suivre ses journaux | `journalctl -fu pass-sport-qf-batch@msa` | non |
| Écrire les fichiers de campagne | notebooks, CSV, `git pull` | non |
| Jouer un passage FC à la main | `./run_fc_pipeline.sh` | non |

`status` et `journalctl` se passent de `sudo` : le premier est lisible sans privilège, le
second l'est par l'appartenance au groupe `systemd-journal`. Si `journalctl` répond mais reste
vide, c'est ce groupe qui manque.

À l'inverse, `systemctl start` **sans** `sudo` échoue (`Access denied`) : il n'y a pas de règle
polkit, tout passe par sudoers.

### Ce que le groupe ne peut pas faire

```bash
sudo systemctl enable pass-sport-qf-batch@msa   # refusé
sudo systemctl start nginx                      # refusé
sudo -i                                         # refusé
```

`enable`/`disable` est volontairement hors périmètre, et **ne doit pas y être ajouté** : rien
ne doit démarrer au boot, et c'est le seul verbe dont l'octroi ouvrirait une escalade vers root
(activer une unité arbitraire revient à faire exécuter n'importe quoi par root au redémarrage).
La raison est répétée dans [templates/pass-sport-sudoers.j2](templates/pass-sport-sudoers.j2),
pour que personne ne l'ajoute plus tard sans voir ce que ça ouvre.

### Les fichiers, et pourquoi ils sont partagés

Un passage fait trois allers-retours entre les comptes : un humain exécute le notebook phase 1
qui écrit l'entrée qf-batch, le compte de service exécute l'unité qui écrit la sortie, un
humain exécute le notebook phase 2 qui la relit. Le playbook rend cela transparent :

- le dépôt est `group: passsport`, avec **setgid** sur tous les dossiers — tout fichier créé
  hérite du groupe, quel que soit le compte qui l'écrit ;
- `chmod -R g+rwX,o-rwx` — le groupe lit et écrit, **les autres comptes n'ont rien** ;
- `UMask=0007` sur l'unité et `umask 007` sur les sessions humaines
  (`/etc/profile.d/pass-sport-umask.sh`) : les fichiers naissent en `rw-rw----`.

Ce dernier point n'est pas cosmétique : ces CSV portent des identités pivot et des courriels.
Un fichier en `rw-r--r--` dans l'arbre signale que l'umask n'a pas été appliqué — typiquement
un shell non-login, `/etc/profile.d` n'étant lu qu'à la connexion.

Deux réglages git accompagnent le partage : `safe.directory` au niveau système (sans lui git
refuse un dépôt appartenant à un autre compte — « detected dubious ownership », le premier mur
d'un dépôt partagé) et `core.sharedRepository=group` (pour que git crée ses objets
group-writable sans dépendre de l'umask de la session).

## Ni qf-batch ni la cron FranceConnect ne démarrent tout seuls

C'est une garantie du playbook, pas un oubli à corriger :

- **l'unité systemd `pass-sport-qf-batch@`** est déposée mais jamais `enable`d ni démarrée.
  Chaque passage se déclenche à la main, un partenaire à la fois :
  `systemctl start pass-sport-qf-batch@msa`. Rien ne le lance au démarrage de la machine ni à
  l'issue du playbook ;
- **l'entrée crontab `pass-sport-fc`** est posée **désactivée** (commentée) par défaut. Le
  premier passage automatique n'a lieu qu'après l'avoir explicitement activée :
  ```bash
  ansible-playbook -i localhost, -c local deploy/ansible/lamp-setup.yml \
    --extra-vars @~/pass-sport-secrets.yml \
    --extra-vars pass_sport_fc_cron_enabled=true
  ```
  Ne l'activer qu'une fois les deux prérequis suivants validés : l'empreinte SSH Scalingo
  amorcée (ci-dessous) et un essai à blanc réussi
  (`FC_PROD_DROP_DIR=/tmp/fc-drop ./run_fc_pipeline.sh`, voir le
  [README de franceconnect/](../../data/2026/partners/franceconnect/README.md)). Le passage
  dépose son CSV en production et marque `eligibility_results` : le laisser partir seul avant
  d'avoir vérifié tout le reste n'a pas d'utilité et un vrai coût si quelque chose est mal
  configuré.

## Premier déploiement — le clone

Le playbook vit dans le dépôt qu'il provisionne : le clone initial est donc un amorçage
manuel, fait par root, une seule fois.

```bash
sudo git clone <url du dépôt> /srv/pass-sport
```

**Ne pas chercher à ajuster le propriétaire à la main** : le compte `passsport` n'existe pas
encore à ce stade, et c'est le playbook qui remet propriétaire, groupe et modes en place — à ce
passage et à tous les suivants.

`/srv` et non `/opt` ni un `/home` : les données de campagne (CSV partenaires,
`qf-batch-workdir`, parquet, `data/.venv`, journaux FC) vivent **dans** le checkout. Ce n'est
pas du code déployé, c'est un plan de travail partagé — « data for services provided by this
system », au sens du FHS. Vérifier au passage que la partition tient : `df -h /srv`, l'arbre se
compte en giga-octets.

## Utilisation

L'accès à la machine passe par un bastion à session interactive (authentification par mot de
passe) : le transport SSH d'Ansible ne peut pas le traverser. Le playbook est donc joué **sur**
la machine, contre elle-même :

```bash
ssh <alias de ton ~/.ssh/config>      # session interactive, comme d'habitude
cd /chemin/du/depot && git pull
ansible-playbook -i localhost, -c local deploy/ansible/lamp-setup.yml \
  --extra-vars @~/pass-sport-secrets.yml
```

À blanc d'abord :

```bash
ansible-playbook -i localhost, -c local deploy/ansible/lamp-setup.yml \
  --extra-vars @~/pass-sport-secrets.yml --check --diff
```

## Secrets — rien dans ce dépôt, il est public

`SCALINGO_APP` et `SCALINGO_API_TOKEN` arrivent par `--extra-vars`, depuis un fichier gardé
**hors dépôt**, en mode `600` :

```yaml
# ~/pass-sport-secrets.yml — jamais versionné
scalingo_app: <application hébergeant la base>
scalingo_api_token: <jeton>
```

Trois choses ne vont dans aucun dépôt, public ou privé — un dépôt privé n'étant pas un
gestionnaire de secrets, il ne ferait que déplacer le problème :

- le jeton Scalingo, comme ci-dessus ;
- **la configuration du bastion** (hôte, port, compte) : elle vit dans le `~/.ssh/config` de
  l'opérateur ;
- les noms d'hôtes d'infrastructure internes.

## Ce que le playbook ne fait pas

- **L'empreinte SSH de Scalingo.** `db-tunnel` monte une connexion SSH vers
  `ssh.osc-fr1.scalingo.com` ; sur un `known_hosts` vide il attend une réponse que la cron ne
  donnera jamais. À amorcer une fois, à la main, sous le compte qui portera la cron :
  `scalingo --app "$SCALINGO_APP" db-tunnel SCALINGO_POSTGRESQL_URL` (interactif, `Ctrl+C`
  pour l'arrêter une fois l'empreinte acceptée).
- **`data/.env` et `worker/.env.local`** — chemins de campagne et jeton API Particulier. Ils
  changent d'une campagne à l'autre, là où le playbook décrit la machine.
- **le montage `/nfs/postgresql`** — il appartient à l'infra ; le playbook vérifie seulement
  qu'il est inscriptible.

## Vérification après un provisioning

1. `--check --diff` d'abord, puis le playbook joué **deux fois de suite** : le second passage
   doit être entièrement `ok` — seule exception admise, la tâche CLI Scalingo, qui ressort
   `changed` si une nouvelle version a été publiée entre les deux passages (comportement
   voulu, pas un défaut).
2. `scalingo --version`, `psql --version`, `data/.venv/bin/jupyter kernelspec list` (doit
   lister `python3`), `systemctl cat pass-sport-qf-batch@`,
   `stat -c '%a %U:%G' /etc/default/pass-sport-fc` → `640 passsport:passsport`.
3. `crontab -l -u <utilisateur> | grep pass-sport-fc` : la ligne doit apparaître **commentée**
   tant que `pass_sport_fc_cron_enabled` n'a pas été mis à `true`.
4. `systemctl list-units 'pass-sport-qf-batch@*'` doit être vide : aucune instance active tant
   que personne n'a lancé `systemctl start pass-sport-qf-batch@<partenaire>`.
5. Aucun secret n'est parti dans le dépôt public :
   `git grep -I -n 'SCALINGO_API_TOKEN=.\|api_token:' -- . ':!*.md'` doit être vide.

### Le groupe d'exploitation

6. `getent group passsport` liste le compte de service et les deux opérateurs ;
   `id <compte1>` montre `passsport` et `systemd-journal`.
7. `visudo -c` sans erreur, puis `sudo -l -U <compte1>` : les trois verbes attendus, et rien
   d'autre. Surtout, contrôler les refus :
   ```bash
   sudo systemctl enable pass-sport-qf-batch@msa   # doit être refusé
   sudo systemctl start  nginx                     # doit être refusé
   sudo systemctl start  pass-sport-qf-batch@msa   # doit passer
   ```
8. Sous `<compte1>` : `systemctl status pass-sport-qf-batch@msa` et
   `journalctl -u pass-sport-qf-batch@msa -n 20` doivent rendre le journal, **sans** `sudo` et
   sans « No journal files were found ».
9. **Le va-et-vient de fichiers, le vrai test** : sous `<compte1>`, écrire un fichier d'essai
   dans `data/2026/partners/qf-batch-workdir/`, puis vérifier sous `<compte2>` qu'il est
   modifiable (`test -w`) et que son mode est `rw-rw----` avec le groupe `passsport`. Un
   `rw-r--r--` signale que `/etc/profile.d/pass-sport-umask.sh` n'a pas été appliqué — shell
   non-login.
10. **Rien pour les autres comptes** — ce qui protège les identités pivot. `-not -type l` est
    nécessaire : `node_modules/` de pnpm est plein de liens symboliques, toujours affichés
    `777` par le noyau quelle que soit la protection réelle — sans cette exclusion la commande
    ne sera jamais vide, même quand tout est correctement verrouillé (vérifié en testant ce
    playbook avec Molecule : ~750 faux positifs, tous des liens, la cible réelle en `2770`) :
    ```bash
    find /srv/pass-sport -perm /o=rwx -not -type l | head   # doit être vide
    ```
11. **git à deux** — sous `<compte1>` puis `<compte2>` : `cd /srv/pass-sport && git status` ne
    doit pas dire « detected dubious ownership », et
    `git config --get core.sharedRepository` doit rendre `0660`.
