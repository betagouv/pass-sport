# Tableau de bord LCA

Ce dossier charge dans la base du site les statistiques de la page publique `/tableau-de-bord`.
Ces statistiques se calculent sur la base LCA. pass Sport n'y a pas accès : c'est son hébergeur qui exécute
les requêtes chaque jour, avec le kit [specs/dashboard/](../../../specs/dashboard/README.md).

```text
Hébergeur LCA, 05:00   export_dashboard.sh   base LCA → /nfs/stats/<AAAA-MM-JJTHH-MM-SS>/*.csv
lamp01, 07:15          run_dashboard.sh      /nfs/stats → tunnel Scalingo → table lca_tableaux_de_bord
site                   /tableau-de-bord      vue lca_tableaux_de_bord_publies (rôle site_readonly)
```

Le contrat de fichier (dossier par extraction, format et colonnes des CSV) est décrit dans le
[README du kit](../../../specs/dashboard/README.md). La table et la vue sont
définies dans `worker/src/db/schema.ts` (migration `0020`).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `run_dashboard.sh` | La cron de lamp01. |
| `load_dashboard.sql` | Le chargement, joué à travers le tunnel depuis le dossier de l'extraction. |
| `test_dashboard.py` | Les tests du kit d'export et du chargement, sur un Postgres jetable (Docker). |

## Un passage

1. `run_dashboard.sh` prend l'extraction la plus récente de `/nfs/stats`, en ignorant les
   dossiers `.partiel` que l'export est en train d'écrire. Si elle n'est pas du jour, le passage
   échoue : rien n'a été déposé.
2. Il vérifie l'en-tête des 7 CSV, puis ouvre un tunnel Postgres vers l'application Scalingo sur
   le port local `10002`. Ce port est distinct de ceux du passage FranceConnect (`10000` et
   `10001`), pour que les deux crons puissent tourner en même temps.
3. `load_dashboard.sql` charge les 7 fichiers dans une table temporaire et les contrôle :
   - les 7 tableaux sont présents ;
   - chaque tableau a une ligne `Total` par jour ;
   - la plage de jours est la même partout.

   Il remplace ensuite tout le contenu de `lca_tableaux_de_bord`, dans une seule transaction.
   Chaque extraction recalcule toute la série depuis l'ouverture de la campagne : on remplace,
   on n'ajoute rien. La page continue de lire l'ancien contenu jusqu'au `commit`.

Charger deux fois la même extraction ne change rien : une reprise consiste à relancer le script.
lamp01 ne fait que lire `/nfs/stats` ; c'est l'export qui purge les extractions de plus de 15 jours.

## Exploitation

```bash
./run_dashboard.sh --dry-run   # tout le chargement, contrôles compris, puis rollback
./run_dashboard.sh             # passage réel

grep echec run/passages.log           # les passages en erreur
cat run/latest/run.log                # le journal du dernier passage
cat run/derniere-erreur/run.log       # celui du dernier échec
```

Toute sortie non nulle est une anomalie, et cron envoie le journal par courriel. Les causes
attendues :

| Message | Cause |
| --- | --- |
| `rien n'a été déposé aujourd'hui` | L'export n'a pas tourné ou a échoué. Voir avec l'hébergeur de la base LCA, puis relancer. |
| `en-tête inattendu` | Le kit installé chez l'hébergeur n'est pas celui de ce dépôt. |
| `le port local 10002 est déjà occupé` | Un tunnel orphelin ou un autre processus écoute sur ce port. |
| `tableaux absents`, `ligne Total`, `plage de jours` | Une extraction incohérente. La table n'a pas bougé. |

Les variables (`TDB_DROP_DIR`, `TDB_TUNNEL_PORT`, `TDB_RUN_DIR`, `TDB_LOCK_FILE`, plus les
`SCALINGO_*` partagées avec le passage FranceConnect) sont décrites en tête du script et lues
dans `data/.env`. Pour un essai sur une extraction de test, on détourne le dossier de dépôt
depuis l'environnement :

```bash
TDB_DROP_DIR=/tmp/stats ./run_dashboard.sh --dry-run
```

## Tests

```bash
cd data && source .venv/bin/activate && pytest 2026/dashboard
```

Les tests lancent le script d'export lui-même sur un extrait du schéma LCA peuplé de données
inventées, puis le chargement sur une base construite à partir des migrations du worker. Ils
couvrent :
- les chiffres de chaque tableau ;
- l'exclusion de la journée en cours, des autres exercices, des refus et des inscriptions
  d'`id_etat` hors 1 à 4 ;
- la purge à 15 jours ;
- le remplacement, le dry-run et les refus du chargement.
