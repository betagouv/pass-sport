# Tester `lamp-setup.yml` avec Molecule

Ce scénario fait tourner le vrai [lamp-setup.yml](../lamp-setup.yml) dans un conteneur Docker
jetable, avec un vrai `systemd` en PID 1 — pas une simulation : `systemctl`, `cron`, `sudo` et
les journaux s'y comportent comme sur la machine réelle. C'est le seul moyen honnête de tester
ce playbook sans toucher à la machine de traitement.

Aucun hyperviseur (Vagrant/libvirt/VirtualBox) n'est utilisé : Docker suffit à faire tourner un
systemd réel, et c'est ce qui est disponible ici. La cible est `ubuntu:26.04`, la même version
que la machine de traitement.

## Installation (une fois)

```bash
cd deploy/ansible
python3 -m venv .venv-molecule
source .venv-molecule/bin/activate
pip install 'ansible-core>=2.16' 'molecule>=25' 'molecule-plugins[docker]'
```

## Utilisation

```bash
cd deploy/ansible
source .venv-molecule/bin/activate

molecule converge   # crée le conteneur, PUIS joue lamp-setup.yml dedans — sans le détruire
molecule login      # s'y connecter pour inspecter le résultat
molecule destroy    # supprimer le conteneur une fois fini
```

`molecule converge` correspond exactement à ce que tu demandais : ça s'arrête après avoir joué
le playbook, sans nettoyer derrière — le conteneur reste là pour être inspecté. Rejouer
`molecule converge` sur un conteneur déjà créé rejoue seulement `lamp-setup.yml` (test
d'idempotence direct) sans recréer le conteneur.

### Une fois connecté (`molecule login`)

```bash
getent group passsport                         # le groupe et ses 3 comptes
sudo -l -U kelvao                               # les 3 verbes systemctl, rien d'autre
sudo systemctl start pass-sport-qf-batch@essai  # échoue proprement (pas d'entrée CSV) — normal
systemctl status pass-sport-qf-batch@
crontab -l -u passsport                         # la ligne PATH= et l'entrée FC, commentée
stat -c '%a %U:%G' /srv/pass-sport /etc/default/pass-sport-fc
find /srv/pass-sport -perm /o=rwx | head            # doit être vide
scalingo --version
data/.venv/bin/jupyter kernelspec list          # doit lister python3
```

## Ce que ce scénario fait, dans l'ordre

1. **`Dockerfile`** — construit une image `ubuntu:26.04` + `systemd-sysv`, `CMD ["/sbin/init"]`.
   `molecule.yml` la lance `privileged`, avec `cgroupns_mode: host` et `/sys/fs/cgroup` monté :
   c'est ce qui permet à un vrai systemd de démarrer dans un conteneur.
2. **`prepare.yml`** — attend que systemd soit stable, copie le dépôt (monté en lecture seule
   depuis le poste de dev) vers `/srv/pass-sport` **à l'intérieur** du conteneur, installe `ansible`
   via apt (le tout premier geste documenté pour la vraie machine), et crée `/tmp/fc-drop` en
   remplacement du montage NFS réel.
3. **`converge.yml`** — lance, **depuis l'intérieur du conteneur**,
   `ansible-playbook -i localhost, -c local /srv/pass-sport/deploy/ansible/lamp-setup.yml`, avec de
   fausses valeurs ([test-secrets.yml](default/test-secrets.yml)) et
   `fc_prod_drop_dir=/tmp/fc-drop`. C'est l'invocation exacte que documente
   [deploy/ansible/README.md](../README.md) pour la machine réelle.

## Pourquoi le dépôt est copié, pas monté en écriture

`lamp-setup.yml` fait des `chown`/`chmod` récursifs sur `pass_sport_repo`. Un bind mount en
lecture-écriture aurait appliqué ces changements **aux fichiers réels du poste de dev** — un
vrai risque, pas théorique. Le dépôt est donc monté en lecture seule
(`/host-pass-sport`), et `prepare.yml` en fait une copie interne (`/srv/pass-sport`) avant de jouer
quoi que ce soit. Seule cette copie, jetable avec le conteneur, est modifiée.

La copie exclut aussi `.git/`, `node_modules/`, `data/.venv/` et `.venv-molecule/` : les garder
aurait masqué si le playbook sait vraiment reconstruire un environnement propre — le venv
Python et les dépendances `pnpm` existent déjà sur le poste de dev, hors de propos ici.

## Secrets de test

[`default/test-secrets.yml`](default/test-secrets.yml) ne contient que des valeurs fictives —
jamais le vrai jeton Scalingo. Sans conséquence : la cron FranceConnect reste posée
**désactivée** par défaut (`pass_sport_fc_cron_enabled` n'est pas mis à `true` dans ce
scénario), donc rien n'appelle jamais l'API Scalingo pour de vrai pendant le test. Les deux
comptes opérateurs de test portent des noms inventés par syllabes, sans rapport avec de vraies
personnes.

## Limites de ce que ce test peut prouver

- **Les installations réseau** (`curl | bash` de la CLI Scalingo et du dépôt NodeSource)
  tournent pour de vrai — le conteneur a besoin d'un accès sortant.
- **Aucun vrai jeton** n'est utilisé : `scalingo --version` fonctionnera, mais un `scalingo
  db-tunnel` échouerait — hors du périmètre de ce que le provisioning doit garantir.
- **Le bastion n'est pas simulé.** Ce test valide ce que `lamp-setup.yml` fait une fois *sur*
  la machine ; il ne teste pas comment on y arrive.
- **Idempotence** : rejouer `molecule converge` est le test le plus utile — un second passage
  doit être presque entièrement `ok`, à l'exception assumée de la tâche CLI Scalingo (qui
  ressort `changed` seulement si une nouvelle version a été publiée entretemps).
