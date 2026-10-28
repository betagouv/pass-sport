# dn-pipeline — codes des bénéficiaires des dossiers Démarches Numériques

Les usagers déposent leur demande dans une démarche **Démarches Numériques** (DN, un dossier par
demandeur, un bloc répétable « Enfants »). Ce pipeline lit les dossiers par l'API, les rapproche
de lamp01, code les nouveaux bénéficiaires, les dépose dans `/nfs/run`, **attend que l'injecteur
de production les ait rangés dans `/nfs/run/succes/`**, puis répond à chaque dossier : codes en
annotation privée, message à l'usager (seul canal par lequel il reçoit ses codes), label et
acceptation.

Il tourne sur le lamp, à la main d'abord, puis en cron (voir [Cron](#cron)).

```bash
cd /srv/pass-sport/data/2026/dn-pipeline
./run_dn.sh --dry-run    # toujours d'abord
./run_dn.sh
./run_dn.sh --reprendre run/<AAAA-MM-JJTHH-MM-SS>   # après un passage inachevé
```

## Ce qui est lu

Les dossiers **en instruction**, **déposés via FranceConnect** (`connectionUsager` =
`france_connect`), qui ne portent aucun des trois labels du pipeline (`Traité`, `À vérifier`,
`Rejeté`). Pour faire repasser un dossier, lui retirer son label.

Chaque dossier reçoit ses réponses (annotation, message, acceptation) **au nom de l'instructeur
qui l'a passé en instruction** : le dernier passage en instruction de ses `traitements`
(`emailAgentTraitant`), retrouvé par son email parmi les instructeurs du groupe du dossier. Un
dossier passé en instruction automatiquement, ou par quelqu'un qui n'est plus instructeur de son
groupe, est ignoré (`sans instructeur`) : il n'est pas codé, faute de pouvoir lui répondre.

Les libellés des champs et les valeurs reconnues (situations, caisses, genres) sont dans
[mapping.py](mapping.py). Ils sont comparés sans accents ni casse.

### Bénéficiaires d'un dossier

- **Le demandeur** s'il est lui-même bénéficiaire : `Je suis bénéficiaire de :` = AAH (situation
  `AAH`, organisme = `À quelle caisse êtes vous rattaché ?`) ou une bourse (situation `boursier`,
  organisme `cnous`, INE facultatif). « Seuls mes enfants sont bénéficiaires… » ne lui donne pas
  de ligne. Sa date de naissance vient du champ `Votre date de naissance`.
- **Chaque enfant** du bloc `Pour chaque enfant…`, si `Est ce qu'un ou plusieurs de vos enfants
  sont éligibles…` ne vaut pas Non : `Est il bénéficiaire de l'AEEH` = Oui → `AEEH`, sauf si la
  question du foyer `Un ou plusieurs de vos enfants sont-ils bénéficiaires de l'AEEH…` vaut Non ;
  sinon `jeune` (QF) si `Font ils partie d'un foyer dont le quotient familial…` vaut Oui ; sinon
  la ligne est rejetée. Organisme = `A quelle caisse sont ils rattachés ?`.
- L'allocataire des enfants est le demandeur : nom, prénom, `Votre civilité :`, date de
  naissance (`Votre date de naissance`, obligatoire dans la démarche), adresse de résidence (dont
  le code INSEE) et email.
- Les colonnes du **mandataire** (dépôt pour un tiers) ne sont **jamais** utilisées. Sur un
  dépôt pour un tiers, l'email est celui du demandeur, pas celui du compte qui a déposé.

Un dossier sans aucun bénéficiaire donne quand même une ligne rejetée, pour que l'usager reçoive
une réponse.

## Lignes erronées

Une ligne invalide est écartée avec son motif dans `rejets.csv` ; les autres continuent. Motifs :
champ vide, genre, situation ou caisse inconnus, date illisible, email invalide, code INSEE
invalide, hors fenêtre d'âge de la situation (AAH 1996-2010, AEEH 2007-2020, jeune 2009-2020,
boursier à partir de 1998). Un boursier sans INE n'est pas rejeté. Le même bénéficiaire présent
deux fois dans le lot (dans un dossier ou dans deux) n'est gardé qu'une fois :
`doublon de dn:<dossier>:enfant-1`.

## Rapprochement avec lamp01

[match_dn.sql](match_dn.sql) est **propre à ce parcours**, indépendant de
`franceconnect/match_beneficiaires.sql`. Il compare le bénéficiaire sur **toutes les situations
et caisses** de l'exercice, et pour un enfant son parent en plus. Le n° allocataire n'est jamais
utilisé, ni le genre du bénéficiaire, sauf pour un boursier sans INE.

| Correspondance | Règle | Verdict |
|---|---|---|
| `ine` | boursier : même INE (organisme cnous) | **Doublon** : pas de nouveau code |
| `exacte` | nom, prénom(s) et date de naissance identiques (normalisés). Boursier sans INE : en plus même genre, et ligne lamp01 en situation boursier | **Doublon** : pas de nouveau code |
| `identite` | boursier sans INE : nom, prénom(s) et date identiques, mais genre ou situation différents (homonyme, genre mal saisi, ou même personne sous une autre aide) | **À vérifier** : pas de code |
| `proche` | même date, et même nom avec un prénom en commun (LEA / LEA ROSE), ou mêmes prénoms avec un nom en commun (MARTIN / MARTIN DUPONT) | **À vérifier** : pas de code |
| `parent` | enfant (AEEH, jeune) : même date et même parent (nom de l'allocataire, prénoms contenus les uns dans les autres, genre et date de naissance quand les deux côtés les connaissent) | **À vérifier** : pas de code |
| aucune | | **à coder** |

Le parent n'est jamais exigé par les autres correspondances : un enfant redéclaré par son autre
parent reste un **Doublon**. Il rattrape ce qu'elles laissent passer, comme un prénom mal saisi
(LEAH / LEA) ou l'enfant inscrit sous le nom de l'autre parent.

Le demandeur DN arrive avec son identité FranceConnect : nom de naissance et tous ses prénoms.
lamp01 garde, pour la CNAF, le nom d'usage et un seul prénom. Le parent est donc reconnu :
- par son nom tel que lamp01 l'a, ou par son nom de naissance de
  `beneficiaire_cnaf_extra_field` (DORVAT saisi, MARTIN dans lamp01) ;
- par des prénoms contenus les uns dans les autres (CLAIRE YSOLDE saisi, CLAIRE dans lamp01) ;
- genre et date de naissance ne bloquent que s'ils sont connus des deux côtés et différents. La
  date écarte un parent homonyme ; lamp01 l'a pour la MSA, les lignes ARS et les codes
  FranceConnect et DN, pas pour l'AEEH de la CNAF.

Deux jumeaux (même nom, même date, aucun prénom commun) ne sont pas « proches », mais ils ont le
même parent : le second déclaré passe donc en **À vérifier**.

**`investigation.csv`** met côte à côte, pour chaque doublon et chaque cas à vérifier, la ligne
saisie (`saisie_*`, lien du dossier DN) et chaque ligne lamp01 touchée (`lamp01_*` : code,
identité, situation, caisse, allocataire et sa date de naissance, date d'injection). Un dossier
« À vérifier » jugé homonyme se relance en retirant son label : il repassera le même
rapprochement (pas encore de forçage).

## Étapes

1. **Contrôles** : verrou partagé avec la cron FranceConnect (`FC_LOCK_FILE`), passage inachevé
   (`run/a-reprendre`), dépôt en attente dans `/nfs/run`.
2. **Lecture** de DN (`fetch`), réponse brute gardée dans le dossier du passage.
3. **Nettoyage** (`clean`) : une ligne par bénéficiaire au schéma PSP, rejets.
4. **Rapprochement** (`match_dn.sql`, puis `split`).
5. **Codes** : `fc_pipeline.py codes`, sur `EXISTING_CODES_PATHFILE_2026`, puis les fichiers de
   production et de lamp01.
6. **Contrôle de l'injection lamp01** : `lamp01/inject_csv.sh --dry-run`, jouée puis annulée.
   Ce que lamp01 refuserait est connu avant tout dépôt.
7. **Dépôt dans `/nfs/run`** : `beneficiaires-insertion-<N>-<horodatage>.csv`, atomique.
8. **Attente de la production** : toutes les 30 s (`DN_ATTENTE_PAS_S`), au plus 2 h
   (`DN_ATTENTE_PROD_MIN`). Le passage continue quand l'injecteur de production a rangé le
   fichier dans `/nfs/run/succes/`, et seulement là : `succes/<nom sans .csv>/<nom>.csv`, à côté
   de son `.log` (un fichier rangé à plat, `succes/<nom>.csv`, est reconnu aussi).
   - Fichier rangé dans `/nfs/run/failed/` : **jamais rejoué**. Rien n'entre dans lamp01, aucun
     code n'est donné : les dossiers concernés reçoivent le label `À vérifier`, sans message à
     l'usager. Les autres dossiers du passage (doublons, rejets, à vérifier) reçoivent leurs
     retours habituels. Le passage finit en erreur, sans rien à reprendre.
   - Délai dépassé : arrêt, rien dans lamp01, aucun retour. La production peut encore prendre
     le fichier : le passage est à reprendre.
9. **Injection dans lamp01** : `lamp01/inject_csv.sh`, tout ou rien, seulement une fois le
   fichier dans `succes/`. Chaque ligne CAF y reçoit sa ligne `beneficiaire_cnaf_extra_field`
   (nom, genre et date de naissance de l'allocataire : le bénéficiaire AAH lui-même, le parent
   d'un enfant), et chaque ligne la date de naissance de son allocataire.
   Le rapprochement FranceConnect (`match_beneficiaires.sql`) ne retrouve un code que par elles :
   sans elles, un enfant codé ici puis jugé éligible sur le site recevrait un second code.
10. **Retours** (`retours`), par dossier :
    1. l'**annotation privée** `Codes pass Sport` (instructeurs seulement) reçoit une ligne
       `Prénom Nom : code` par code de ce passage, à la suite de ce qu'elle contenait ;
    2. un **message à l'usager**, une ligne par bénéficiaire, avec son code s'il vient d'être
       créé. Le code d'un doublon n'est jamais donné : venu de lamp01, il pourrait être celui
       d'un homonyme ;
    3. un **label** : `À vérifier` si un bénéficiaire l'est, sinon `Rejeté` si un bénéficiaire
       l'est, sinon `Traité` ;
    4. **`dossierAccepter`** si le dossier est `Traité` (tous codés ou déjà détenteurs d'un code).
       Un dossier `À vérifier` ou `Rejeté` reste en instruction : l'instructeur le clôt.

    Sur un dossier déposé pour un tiers, c'est le mandataire qui lit le message, codes compris.

Ordre garanti : `/nfs/run`, puis production, puis lamp01, puis retours. lamp01 ne détient jamais
un code que la production n'a pas, et aucun usager n'est prévenu d'un code avant que l'injecteur
ait rangé son fichier dans `succes/`.

## Passage à blanc

`--dry-run` lit DN (lecture seule) et joue toutes les étapes sans rien écrire hors de son
dossier `run/<horodatage>-dry-run/` : codes tirés sur une copie, injection lamp01 annulée
(ROLLBACK), rien de déposé ni attendu, aucune écriture DN (`retours.csv` en `simule`, avec le
texte exact des annotations et des messages).

Pour une recette sur lamp01 d'intégration avec un dossier de dépôt détourné
(`FC_PROD_DROP_DIR=/tmp/…`), aucun injecteur ne range le fichier : y ajouter
`DN_ATTENTE_PROD_MIN=0`, qui saute la vérification de la production. **Jamais en
production.**

## Dossier d'un passage

Chaque passage crée `run/<AAAA-MM-JJTHH-MM-SS>[-dry-run]/` et ajoute une ligne à `run/passages.log`.
`run/latest` pointe vers le dernier passage, `run/derniere-erreur` vers le dernier échec.

| Fichier | Contenu |
|---|---|
| `dn-brut.json` | réponse de l'API (dossiers à traiter) |
| `rejets.csv` | lignes écartées et motif |
| `verdicts.csv` | verdict de chaque ligne : `rejete`, `doublon`, `a_verifier`, `a_coder` |
| `investigation.csv` | doublons et cas à vérifier, face aux lignes lamp01 touchées |
| `prod.csv` | ce qui est déposé dans `/nfs/run` |
| `lamp01.csv` | ce qui est injecté dans lamp01 |
| `writeback.csv` | le code de chaque bénéficiaire codé, repris dans DN |
| `depose`, `en-production`, `refuse`, `lamp01` | marqueurs : fichier déposé, rangé dans `succes/` ou dans `failed/` par l'injecteur, codes injectés dans lamp01 |
| `retours.csv` | journal des retours DN : `fait`, `erreur` ou `simule` |
| `run.log` | journal complet |

## Reprise après échec

- **Avant le dépôt** (API, nettoyage, rapprochement, injection lamp01 refusée au contrôle) :
  rien n'est sorti. Corriger, relancer normalement.
- **Après le dépôt** : `run/a-reprendre` est posé et **tout nouveau passage refuse de
  démarrer**, sans quoi les lignes déjà codées seraient codées une seconde fois. Corriger la
  cause, puis `./run_dn.sh --reprendre run/<horodatage>` : dépôt s'il n'a pas eu lieu,
  attente de la production si elle n'a pas abouti, injection lamp01, retours, chacun sautant ce
  que son marqueur ou son journal marque comme fait. Un dossier labellisé `Traité` dont
  l'acceptation a échoué n'est accepté que par cette reprise : les passages suivants ne le
  prennent plus.
- **Fichier refusé par la production** (rangé dans `/nfs/run/failed/`) : rien à reprendre, le
  fichier n'est jamais rejoué. Ses dossiers portent le label `À vérifier` : après correction,
  retirer le label pour qu'un passage suivant les recode, avec de nouveaux codes.
- Une ligne `erreur` sans réponse (mutation DN : délai dépassé) est peut-être partie :
  vérifier le dossier avant de reprendre.
- Une erreur qui ne se résout pas par le pipeline (dossier DN supprimé…) se traite à la main ;
  supprimer ensuite `run/a-reprendre` pour rouvrir les passages.

## Cron

Entrée `pass-sport-dn`, chaque nuit à 3 h (`0 3 * * *`), posée **désactivée** par
[deploy/ansible](../../../deploy/ansible/README.md) tant que `pass_sport_dn_cron_enabled`
vaut `false`. FranceConnect ne tourne pas entre minuit et 6 h : à 3 h, son verrou est libre et son
dernier dépôt (23 h 30) a eu le temps de quitter `/nfs/run`. Le verrou reste pris pendant
l'attente de la production (2 h au plus) : à 3 h, elle se termine avant la reprise de
FranceConnect. Lancé à la main dans la journée, le passage fait reporter les passages FranceConnect
pendant qu'il attend. Rien à traiter, verrou pris ou dépôt en attente : sortie 0, le passage est
reporté à la nuit suivante. Passage inachevé : sortie 1 chaque nuit, jusqu'à la reprise.

## Configuration

| Variable | Où | Défaut |
|---|---|---|
| `DN_API_TOKEN` (droits d'écriture), `DN_DEMARCHE_NUMBER` | `data/.env` | obligatoires |
| `DN_API_URL` | `data/.env` | `https://demarche.numerique.gouv.fr/api/v2/graphql` |
| `DN_RUN_DIR` | `data/.env` | `run/` dans ce dossier |
| `DN_ATTENTE_PROD_MIN`, `DN_ATTENTE_PAS_S` | `data/.env` | `120` (0 : pas de vérification, recette seulement), `30` |
| `DN_DOSSIERS` | environnement | vide : tous les dossiers ; `123,456` : ceux-là seulement (recette) |
| `EXISTING_CODES_PATHFILE_2026`, `LAMP_DB_*`, `FC_PROD_DROP_DIR`, `FC_LOCK_FILE`, `FC_EXERCICE_ID` | `data/.env` | comme `support-pipeline` |

Les variables déjà présentes dans l'environnement l'emportent. Le dépôt est public : le jeton ne
va que dans `data/.env`.

### Vérifier l'accès à la démarche

`./apercu_dn.sh`, en lecture seule, n'écrit rien dans DN ni lamp01 :

| Commande | Montre |
|---|---|
| `./apercu_dn.sh` | jeton, démarche, labels, annotation privée `Codes pass Sport`, dossiers par état et par connexion, dossiers à traiter, libellés des champs comparés à `mapping.py` (`ok` / `ABSENT`) |
| `--extraction` | en plus, le nettoyage du pipeline sur ce qu'il prendrait, dans un dossier temporaire privé dont le chemin est donné (à supprimer une fois lu) ; mêmes noms de fichiers qu'un vrai passage |
| `--voir` | idem, et l'affiche lisiblement : dossiers récupérés, bénéficiaires extraits, format PSP envoyé à lamp01 et `/nfs/run`, rejets (**données personnelles à l'écran**) |

Sans option, rien de personnel n'est affiché : libellés et comptes seulement.

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
  - le champ `Votre date de naissance`, obligatoire : celle du bénéficiaire AAH ou boursier, et
    celle du parent pour ses enfants ;
  - l'annotation privée `Codes pass Sport`, de type **Texte long**. Sans elle, le passage
    s'arrête dès la lecture de DN.

## Tests

```bash
cd data
source .venv/bin/activate
pytest 2026/dn-pipeline   # SQL : docker ; rapprochement FC : docker et psql ; bout-en-bout : docker, psql, flock et bash >= 4
```
