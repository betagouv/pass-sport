# grist-dn-pipeline — codes des bénéficiaires recensés dans Grist et Démarches Numériques

Le support recense des bénéficiaires dans un tableau **Grist** (une ligne par bénéficiaire) et
dans une démarche **Démarches Numériques** (DN, un dossier par demandeur, un bloc répétable
« Enfants »). Ce pipeline les lit par leurs API, les rapproche de lamp01, code les nouveaux,
les dépose dans `/nfs/run`, **attend que l'injecteur de production les ait rangés dans
`/nfs/run/succes/`**, leur envoie leur code par mail, puis répond à chaque source : `Statut` dans
Grist ; codes en annotation privée, message à l'usager, label et acceptation pour chaque dossier
DN.

Il tourne sur le lamp, à la main d'abord, puis en cron (voir [Cron](#cron)).

```bash
cd /srv/pass-sport/data/2026/grist-dn-pipeline
./run_grist_dn.sh --dry-run    # toujours d'abord
./run_grist_dn.sh
./run_grist_dn.sh --reprendre run/<AAAA-MM-JJTHH-MM-SS>   # après un passage inachevé
```

## Ce qui est lu

- **Grist** : les lignes dont `Eligibilité` vaut une valeur retenue et dont `Statut` est vide.
  Les autres sont ignorées sans être touchées. Pour faire repasser une ligne, vider son `Statut`.
- **DN** : les dossiers **en instruction**, **déposés via FranceConnect** (`connectionUsager`
  = `france_connect`), qui ne portent aucun des trois labels du pipeline
  (`Traité`, `À vérifier`, `Rejeté`).
  Pour faire repasser un dossier, lui retirer son label.

Les libellés de colonnes et de champs, et les valeurs reconnues (situations, caisses, genres,
`Eligibilité`) sont dans [mapping.py](mapping.py). Ils sont comparés sans accents ni casse.
**TODO** : les valeurs exactes de `Situation`, `Eligibilité` et `Bénéficiaire de` sont à
reprendre sur les exemples du support.

### Bénéficiaires d'un dossier DN

- **Le demandeur** s'il est lui-même bénéficiaire : `Bénéficiaire de` = AAH (situation `AAH`,
  organisme = la caisse) ou une bourse (situation `boursier`, organisme `cnous`, INE facultatif).
  Sa date de naissance vient du champ `Votre date de naissance`.
- **Chaque enfant** du bloc `Enfants` : `AEEH` = Oui → `AEEH` ; sinon `jeune` (QF) si la question
  « foyer au QF ≤ 699 € et/ou AEEH » vaut Oui ; sinon la ligne est rejetée.
- L'allocataire des enfants est le demandeur : nom, prénom, `Genre de l'allocataire`, adresse
  de résidence (dont le code INSEE) et email.
- Les colonnes du **mandataire** (dépôt pour un tiers) ne sont **jamais** utilisées. Sur un
  dépôt pour un tiers, l'email est celui du demandeur, pas celui du compte qui a déposé.

Un dossier sans aucun bénéficiaire donne quand même une ligne rejetée, pour que l'usager reçoive
une réponse.

## Lignes erronées

Sur les lignes retenues de la CAF, le **n° allocataire** est ramené à ses 7 premiers chiffres, complétés
de zéros à gauche : « 12345 » → `0012345`, « 1234567 89 » → `1234567`. Il est rangé dans lamp01
(`allocataire.matricule`) mais ne sert jamais au rapprochement. MSA et INE ne sont pas touchés.
Un code INSEE `00000` (cellule Grist laissée à 0) est retiré de l'adresse, sans rejeter la ligne.

Une ligne invalide est écartée avec son motif dans `rejets.csv` ; les autres continuent. Motifs :
champ vide, genre, situation ou caisse inconnus, date illisible, email invalide, code INSEE
invalide, hors fenêtre d'âge de la situation (AAH 1996-2010, AEEH 2007-2020, jeune 2009-2020,
boursier à partir de 1998). Un boursier sans INE n'est pas rejeté. Le même bénéficiaire présent deux fois
dans le lot (dans une source, ou dans Grist et DN) n'est gardé qu'une fois : `doublon de grist:12`.

## Rapprochement avec lamp01

[match_grist_dn.sql](match_grist_dn.sql) est **propre à ce parcours**, indépendant de
`franceconnect/match_beneficiaires.sql`. Il compare le bénéficiaire sur **toutes les situations
et caisses** de l'exercice, et pour un enfant son parent en plus. Le n° allocataire n'est jamais
utilisé, ni le genre du bénéficiaire, sauf pour un boursier sans INE.

| Correspondance | Règle | Verdict |
|---|---|---|
| `ine` | boursier : même INE (organisme cnous) | **Doublon** : ni code, ni mail |
| `exacte` | nom, prénom(s) et date de naissance identiques (normalisés). Boursier sans INE : en plus même genre, et ligne lamp01 en situation boursier | **Doublon** : ni code, ni mail |
| `identite` | boursier sans INE : nom, prénom(s) et date identiques, mais genre ou situation différents (homonyme, genre mal saisi, ou même personne sous une autre aide) | **À vérifier** : ni code, ni mail |
| `proche` | même date, et même nom avec un prénom en commun (LEA / LEA ROSE), ou mêmes prénoms avec un nom en commun (MARTIN / MARTIN DUPONT) | **À vérifier** : ni code, ni mail |
| `parent` | enfant (AEEH, jeune) : même date et même parent (nom et prénom de l'allocataire, et genre quand les deux côtés le connaissent) | **À vérifier** : ni code, ni mail |
| aucune | | **à coder** |

Le parent n'est jamais exigé par les autres correspondances : un enfant redéclaré par son autre
parent reste un **Doublon**. Il rattrape ce qu'elles laissent passer, comme un prénom mal saisi
(LEAH / LEA) ou l'enfant inscrit sous le nom de l'autre parent. Le genre du parent ne bloque que
s'il est connu des deux côtés et différent (M / Mme dans lamp01).

Deux jumeaux (même nom, même date, aucun prénom commun) ne sont pas « proches », mais ils ont le
même parent : le second déclaré passe donc en **À vérifier**.

**`investigation.csv`** met côte à côte, pour chaque doublon et chaque cas à vérifier, la ligne
saisie (`saisie_*`, lien du dossier DN) et chaque ligne lamp01 touchée (`lamp01_*` : code,
identité, situation, caisse, allocataire, date d'injection). Une ligne « À vérifier » jugée
homonyme se relance en vidant son `Statut` Grist ou en retirant le label DN : elle repassera le
même rapprochement (pas encore de forçage).

## Étapes

1. **Contrôles** : verrou partagé avec la cron FranceConnect (`FC_LOCK_FILE`), passage inachevé
   (`run/a-reprendre`), dépôt en attente dans `/nfs/run`, configuration d'envoi des trois gabarits.
2. **Lecture** des API (`fetch`), réponses brutes gardées dans le dossier du passage.
3. **Nettoyage** (`clean`) : une ligne par bénéficiaire au schéma PSP, rejets.
4. **Rapprochement** (`match_grist_dn.sql`, puis `split`).
5. **Codes** : `fc_pipeline.py codes`, sur `EXISTING_CODES_PATHFILE_2026`, puis les fichiers de
   production, de lamp01 et des mails.
6. **Contrôle de l'injection lamp01** : `lamp01/inject_csv.sh --dry-run`, jouée puis annulée.
   Ce que lamp01 refuserait est connu avant tout dépôt.
7. **Dépôt dans `/nfs/run`** : `beneficiaires-insertion-<N>-<horodatage>.csv`, atomique.
8. **Attente de la production** : toutes les 30 s (`GRIST_DN_ATTENTE_PAS_S`), au plus 2 h
   (`GRIST_DN_ATTENTE_PROD_MIN`). Le passage continue quand l'injecteur de production a rangé le
   fichier dans `/nfs/run/succes/`, et seulement là : `succes/<nom sans .csv>/<nom>.csv`, à côté
   de son `.log` (un fichier rangé à plat, `succes/<nom>.csv`, est reconnu aussi).
   - Fichier rangé dans `/nfs/run/failed/` : **jamais rejoué**. Rien n'entre dans lamp01, aucun
     mail ne part. Ses lignes passent à `Rejeté` dans Grist (motif « refusé par l'injecteur de
     production (fichier) ») et ses dossiers DN reçoivent le label `À vérifier`, sans message à
     l'usager. Les autres lignes du passage (doublons, rejets, à vérifier) reçoivent leurs
     retours habituels. Le passage finit en erreur, sans rien à reprendre.
   - Délai dépassé : arrêt, rien dans lamp01, ni mail ni retour. La production peut encore
     prendre le fichier : le passage est à reprendre.
9. **Injection dans lamp01** : `lamp01/inject_csv.sh`, tout ou rien, seulement une fois le
   fichier dans `succes/`. Les AAH CAF y reçoivent leur ligne `beneficiaire_cnaf_extra_field`,
   pour que le site ne leur redonne pas un code.
10. **Mails** : `pnpm codes:support-emails`, un gabarit par situation (AAH → `code_direct_aah`,
   boursier → `code_direct_boursier`, AEEH et jeune → `code_indirect`, qui nomme le parent),
   programmés à +30 min (`GRIST_DN_EMAIL_DELAY_MIN`).
11. **Retours** (`retours`) :
    - Grist : `Statut` = `Code envoyé`, `Doublon`, `À vérifier` ou `Rejeté`, et le motif dans la
      colonne `GRIST_COLONNE_MOTIF` (sinon ajouté au statut). Sur une ligne `Code envoyé`, la
      colonne `Code` reçoit le code tiré ; jamais sur un doublon (venu de lamp01, il pourrait être
      celui d'un homonyme).
    - DN, par dossier :
      1. l'**annotation privée** `Codes pass Sport` (instructeurs seulement) reçoit une ligne
         `Prénom Nom : code` par code de ce passage, à la suite de ce qu'elle contenait ;
      2. un **message à l'usager**, une ligne par bénéficiaire, avec son code s'il vient d'être
         créé. Le code d'un doublon n'est jamais donné : venu de lamp01, il pourrait être celui
         d'un homonyme ;
      3. un **label** : `À vérifier` si un bénéficiaire l'est, sinon `Rejeté` si un bénéficiaire
         l'est, sinon `Traité` ;
      4. **`dossierAccepter`** si le dossier est `Traité` (tous codés ou déjà détenteurs d'un code).

      Sur un dossier déposé pour un tiers, c'est le mandataire qui lit le message, codes compris.

Ordre garanti : `/nfs/run`, puis production, puis lamp01, puis mail, puis retours. lamp01 ne
détient jamais un code que la production n'a pas, et personne n'est prévenu d'un code avant que
l'injecteur ait rangé son fichier dans `succes/`. Une ligne dont le mail n'est pas parti n'a pas
de retour, et son dossier DN non plus : il attend la reprise.

## Passage à blanc

`--dry-run` lit les API (lecture seule) et joue toutes les étapes sans rien écrire hors de son
dossier `run/<horodatage>-dry-run/` : codes tirés sur une copie, injection lamp01 annulée
(ROLLBACK), rien de déposé ni attendu, Link Mobility jamais appelé (`envois.csv` en `simule`),
aucune écriture Grist ni DN (`retours.csv` en `simule`, avec le texte exact des annotations et
des messages DN).

Pour une recette sur lamp01 d'intégration avec un dossier de dépôt détourné
(`FC_PROD_DROP_DIR=/tmp/…`), aucun injecteur ne range le fichier : y ajouter
`GRIST_DN_ATTENTE_PROD_MIN=0`, qui saute la vérification de la production. **Jamais en
production.**

## Dossier d'un passage

Chaque passage crée `run/<AAAA-MM-JJTHH-MM-SS>[-dry-run]/` et ajoute une ligne à `run/passages.log`.
`run/latest` pointe vers le dernier passage, `run/derniere-erreur` vers le dernier échec.

| Fichier | Contenu |
|---|---|
| `grist-brut.json`, `dn-brut.json` | réponses des API (lignes et dossiers à traiter) |
| `rejets.csv` | lignes écartées et motif |
| `verdicts.csv` | verdict de chaque ligne : `rejete`, `doublon`, `a_verifier`, `a_coder` |
| `investigation.csv` | doublons et cas à vérifier, face aux lignes lamp01 touchées |
| `prod.csv` | ce qui est déposé dans `/nfs/run` |
| `lamp01.csv` | ce qui est injecté dans lamp01 |
| `writeback.csv` | le code de chaque bénéficiaire codé, repris dans DN |
| `depose`, `en-production`, `refuse`, `lamp01` | marqueurs : fichier déposé, rangé dans `succes/` ou dans `failed/` par l'injecteur, codes injectés dans lamp01 |
| `emails.csv` / `envois.csv` | entrée et journal des mails |
| `retours.csv` | journal des retours Grist et DN : `fait`, `erreur` ou `simule` |
| `run.log` | journal complet |

## Reprise après échec

- **Avant le dépôt** (API, nettoyage, rapprochement, injection lamp01 refusée au contrôle) :
  rien n'est sorti. Corriger, relancer normalement.
- **Après le dépôt** : `run/a-reprendre` est posé et **tout nouveau passage refuse de
  démarrer**, sans quoi les lignes déjà codées seraient codées une seconde fois. Corriger la
  cause, puis `./run_grist_dn.sh --reprendre run/<horodatage>` : dépôt s'il n'a pas eu lieu,
  attente de la production si elle n'a pas abouti, injection lamp01, mails, retours, chacun
  sautant ce que son marqueur ou son journal marque comme fait.
- **Fichier refusé par la production** (rangé dans `/nfs/run/failed/`) : rien à reprendre, le
  fichier n'est jamais rejoué. Ses lignes sont marquées `Rejeté` (Grist) et `À vérifier` (DN) :
  après correction, vider leur `Statut` ou retirer le label pour qu'un passage suivant les
  recode, avec de nouveaux codes.
- Une ligne `erreur` sans réponse (mail ou mutation DN : délai dépassé) est peut-être partie :
  vérifier avant de reprendre.
- Une erreur qui ne se résout pas par le pipeline (adresse refusée par Link Mobility, dossier DN
  supprimé…) se traite à la main ; supprimer ensuite `run/a-reprendre` pour rouvrir les passages.

## Cron

Entrée `pass-sport-grist-dn`, chaque nuit à 3 h (`0 3 * * *`), posée **désactivée** par
[deploy/ansible](../../../deploy/ansible/README.md) tant que `pass_sport_grist_dn_cron_enabled`
vaut `false`. FranceConnect ne tourne pas entre minuit et 6 h : à 3 h, son verrou est libre et son
dernier dépôt (23 h 30) a eu le temps de quitter `/nfs/run`. Le verrou reste pris pendant
l'attente de la production (2 h au plus) : à 3 h, elle se termine avant la reprise de
FranceConnect. Lancé à la main dans la journée, le passage fait reporter les passages FranceConnect
pendant qu'il attend. Rien à traiter, verrou pris ou dépôt en attente : sortie 0, le passage est
reporté à la nuit suivante. Passage inachevé : sortie 1 chaque nuit, jusqu'à la reprise.

## Configuration

| Variable | Où | Défaut |
|---|---|---|
| `GRIST_API_URL` (ex. `https://grist.numerique.gouv.fr/api`), `GRIST_API_KEY`, `GRIST_DOC_ID`, `GRIST_TABLE_ID` | `data/.env` | obligatoires |
| `GRIST_COLONNE_MOTIF` | `data/.env` | aucune : motif ajouté au statut |
| `DN_API_TOKEN` (droits d'écriture), `DN_DEMARCHE_NUMBER`, `DN_INSTRUCTEUR_ID` | `data/.env` | obligatoires |
| `DN_API_URL` | `data/.env` | `https://demarche.numerique.gouv.fr/api/v2/graphql` |
| `GRIST_DN_SOURCES` | `data/.env` | `grist,dn` |
| `GRIST_DN_RUN_DIR`, `GRIST_DN_EMAIL_DELAY_MIN` | `data/.env` | `run/` dans ce dossier, `30` |
| `GRIST_DN_ATTENTE_PROD_MIN`, `GRIST_DN_ATTENTE_PAS_S` | `data/.env` | `120` (0 : pas de vérification, recette seulement), `30` |
| `EXISTING_CODES_PATHFILE_2026`, `LAMP_DB_*`, `FC_PROD_DROP_DIR`, `FC_LOCK_FILE`, `FC_EXERCICE_ID` | `data/.env` | comme `support-pipeline` |
| `LINK_MOBILITY_API_KEY`, `LINK_MOBILITY_TEMPLATE_CODE_DIRECT_AAH`, `…_DIRECT_BOURSIER`, `…_INDIRECT` | `worker/.env.local` | obligatoires |

Les variables déjà présentes dans l'environnement l'emportent. Le dépôt est public : jetons et
clés ne vont que dans `data/.env`.

### Vérifier l'accès aux deux sources

Lecture seule, rien n'est écrit dans Grist, DN ni lamp01 :

| Commande | Montre |
|---|---|
| `./apercu_dn.sh` | jeton, démarche, labels, annotation privée `Codes pass Sport`, dossiers par état, libellés des champs comparés à `mapping.py` (`ok` / `ABSENT`) |
| `./apercu_grist.sh` | clé, document (tables disponibles si `GRIST_TABLE_ID` est faux), colonnes (libellé, id, type) comparées à `mapping.py`, valeurs rencontrées dans `Eligibilité`, `Situation`, `Caisse`, `Genre`, `Statut` et ce que le pipeline en fait, lignes à traiter |
| `./apercu_grist_dn.sh` | les deux aperçus à la suite ; avec `--extraction` ou `--voir`, les deux sources nettoyées **ensemble**, comme un vrai passage (fusion, doublons entre sources), sans lamp01 ni worker |
| `--extraction` | en plus, le nettoyage du pipeline sur ce qu'il prendrait, dans un dossier temporaire privé dont le chemin est donné (à supprimer une fois lu) ; mêmes noms de fichiers qu'un vrai passage |
| `--voir` | idem, et l'affiche lisiblement : lignes ou dossiers récupérés, bénéficiaires extraits, format PSP envoyé à lamp01 et `/nfs/run`, rejets (**données personnelles à l'écran**) |

Sans option, rien de personnel n'est affiché : libellés, comptes et valeurs des colonnes de
catégorie seulement. `GRIST_API_URL` se termine par `/api` (`https://grist.numerique.gouv.fr/api`) ;
`GRIST_DOC_ID` est l'identifiant du document dans son URL, `GRIST_TABLE_ID` l'id de la table (pas
le nom de la page).

### Dossiers pré-remplis depuis l'espace FranceConnect

Le worker pré-remplit aussi des dossiers de cette démarche. Il le fait quand un usager
FranceConnect refusé clique sur « Vous pensez être éligible ? » (voir
[worker/README.md](../../../worker/README.md#dossier-démarche-numérique-pré-rempli)). Il retrouve
les champs par les mêmes libellés que `mapping.py`, recopiés dans
`worker/src/demarche-numerique/champs-resolver.ts`. Un libellé renommé ici doit l'être là aussi,
puis `pnpm dn:champs` relancé dans `worker/`.

### À faire une fois, à la main

- Dans la démarche DN (interface d'administration, l'API ne sait pas les créer) :
  - les labels `Traité`, `À vérifier`, `Rejeté` (comparés sans casse ni accents, noms dans
    `mapping.py`). Un dossier qui porte l'un de ces labels, même posé à la main, n'est plus pris
    par le pipeline ;
  - le champ `Votre date de naissance` (demandé pour l'AAH ou une bourse) ;
  - l'annotation privée `Codes pass Sport`, de type **Texte long**. Sans elle, le passage
    s'arrête dès la lecture de DN.
- Dans Grist : une colonne `Statut` de type Choix, valeurs exactes `Code envoyé`, `Doublon`,
  `À vérifier`, `Rejeté` ; une colonne `Code` de type Texte (sans elle, le passage s'arrête dès
  la lecture de Grist) ; et une colonne `Motif` de type Texte, avec
  `GRIST_COLONNE_MOTIF=Motif` (sans elle, le motif s'ajoute au statut, hors des choix prévus).
- `DN_INSTRUCTEUR_ID`, l'instructeur au nom duquel partent messages et acceptations :

  ```bash
  curl -s https://demarche.numerique.gouv.fr/api/v2/graphql \
    -H "Authorization: Bearer $DN_API_TOKEN" -H 'Content-Type: application/json' \
    -d '{"query":"{ demarche(number: '"$DN_DEMARCHE_NUMBER"') { groupeInstructeurs { instructeurs { id email } } } }"}'
  ```

## Tests

```bash
cd data
source .venv/bin/activate
pytest 2026/grist-dn-pipeline   # SQL : docker ; bout-en-bout : docker, pnpm, flock et bash >= 4
```
