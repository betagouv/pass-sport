# Provisioning de la machine de traitement

Ce playbook installe ce que la machine de traitement doit porter pour `qf-batch`
([worker/src/scripts/qf-batch.ts](../../worker/src/scripts/qf-batch.ts)) et le passage
FranceConnect
([data/2026/partners/franceconnect/run_fc_pipeline.sh](../../data/2026/partners/franceconnect/run_fc_pipeline.sh)) :
paquets système, CLI Scalingo, Node par nvm, le virtualenv `data/.venv` et son kernel Jupyter,
`/etc/default/pass-sport-fc`, l'unité systemd `qf-batch@` et l'entrée crontab de FC.

## Ni qf-batch ni la cron FranceConnect ne démarrent tout seuls

C'est une garantie du playbook, pas un oubli à corriger :

- **l'unité systemd `pass-sport-qf-batch@`** est déposée mais jamais `enable`d ni démarrée.
  Chaque passage se déclenche à la main, un partenaire à la fois :
  `systemctl start pass-sport-qf-batch@msa`. Rien ne le lance au démarrage de la machine ni à
  l'issue du playbook ;
- **l'entrée crontab `pass-sport-fc`** est posée **désactivée** (commentée) par défaut. Le
  premier passage automatique n'a lieu qu'après l'avoir explicitement activée :
  ```bash
  ansible-playbook -i localhost, -c local deploy/ansible/traitement.yml \
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

## Utilisation

L'accès à la machine passe par un bastion à session interactive (authentification par mot de
passe) : le transport SSH d'Ansible ne peut pas le traverser. Le playbook est donc joué **sur**
la machine, contre elle-même :

```bash
ssh <alias de ton ~/.ssh/config>      # session interactive, comme d'habitude
cd /chemin/du/depot && git pull
ansible-playbook -i localhost, -c local deploy/ansible/traitement.yml \
  --extra-vars @~/pass-sport-secrets.yml
```

À blanc d'abord :

```bash
ansible-playbook -i localhost, -c local deploy/ansible/traitement.yml \
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
   `stat -c '%a %U' /etc/default/pass-sport-fc` → `600 <utilisateur>`.
3. `crontab -l -u <utilisateur> | grep pass-sport-fc` : la ligne doit apparaître **commentée**
   tant que `pass_sport_fc_cron_enabled` n'a pas été mis à `true`.
4. `systemctl list-units 'pass-sport-qf-batch@*'` doit être vide : aucune instance active tant
   que personne n'a lancé `systemctl start pass-sport-qf-batch@<partenaire>`.
5. Aucun secret n'est parti dans le dépôt public :
   `git grep -I -n 'SCALINGO_API_TOKEN=.\|api_token:' -- . ':!*.md'` doit être vide.
