# File d'attente + rate limiting — API Particulier (quota 60 req/min)

## Problème

Le quota API Particulier est de **60 requêtes/minute (~1 appel/seconde)**, global pour tout le service. Un parcours de vérification consomme **5 appels de base + 2 par enfant** (famille de 3 enfants = 11 appels ≈ 11 secondes de la totalité du quota). Débit maximal : **~5 à 10 usagers par minute, tous conteneurs confondus**.

Comportement actuel sous charge : `acquireToken` bloque jusqu'à 2,5 s puis échoue → l'usager voit « Service momentanément saturé » sans aucune information. L'attente devient un échec au lieu d'une file.

Objectif : les usagers qui ne peuvent pas passer immédiatement entrent dans une **file FIFO équitable** et voient **« position N — temps estimé ~M min »**, mis à jour en direct, puis leur vérification se lance automatiquement à leur tour.

## Briques existantes réutilisées

- La session POC vit déjà dans **Redis** (TTL 10 min + cookie id) : `src/app/v2/api/poc-fc-api-particulier/session.ts`. La file référence la session ; l'identité reste où elle est déjà.
- Point d'entrée unique : `POST /v2/api/poc-fc-api-particulier/collect` (`collect/route.ts`), appelé depuis `PostLoginInfoForm.tsx`.
- Token bucket distribué existant (`src/app/services/rate-limiter.ts`) : conservé comme filet de sécurité bas niveau, recalibré au vrai quota.

## Conception : file « ticket de boucherie » dans Redis (exécution en série)

**Un seul parcours s'exécute à la fois (K=1).** Avec un quota de 1 appel/s, paralléliser les parcours les fait juste se disputer le même bucket — la série est plus simple ET rend l'ETA honnête.

### Clés Redis (uniquement des nombres/ids — jamais de données personnelles)

| Clé | Rôle |
|---|---|
| `q:apip:ticket` | compteur `INCR` → numéro de ticket |
| `q:apip:serving` | ticket autorisé à s'exécuter |
| `q:apip:hb:<ticket>` | heartbeat (TTL ~15 s), rafraîchi à chaque poll ; permet de sauter les usagers qui ont fermé l'onglet |
| `q:apip:claim` | posé quand le ticket servi démarre (TTL ~60 s) ; protège contre un conteneur mort en plein parcours |
| `q:apip:avgms` | moyenne mobile (EWMA) des durées de parcours, pour l'ETA (amorcée à 8000 ms) |

### Flux

1. **Enqueue** — `POST .../queue` (nouveau) : exige une session POC vivante ; `INCR ticket`, stocke le ticket dans la session POC (déjà en Redis), renvoie `{ position, etaSeconds }`. Si ETA > ~7 min (doit tenir dans le TTL de session de 10 min), refus avec « Trop de demandes en ce moment, veuillez réessayer plus tard » au lieu d'enfiler.
2. **Poll** — `GET .../queue/status` (nouveau), toutes les ~3 s côté front :
   - Lua atomique : rafraîchit mon heartbeat ; tant que le ticket `serving` est mort (pas de heartbeat, pas de claim), avance `serving` — n'importe quel poller balaye les tickets abandonnés, pas de worker en tâche de fond nécessaire.
   - Renvoie `{ state: 'waiting' | 'ready', position, etaSeconds }` avec `position = monTicket - serving`, `etaSeconds = position × avgJourneyMs / 1000` (arrondi à 30 s pour l'affichage).
   - Rafraîchit aussi le TTL de la session POC pour qu'elle n'expire pas pendant l'attente.
3. **Run** — `POST .../collect` existant : avant `callApiParticulierIdentite`, vérification atomique du claim (`monTicket == serving`, pose `q:apip:claim`) ; 409 « pas votre tour » sinon (le front n'appelle qu'après `state: 'ready'`). Dans le `finally` : avance `serving`, supprime le claim, intègre la durée du parcours dans l'EWMA.
4. **Frontend** — `PostLoginInfoForm.tsx` : soumission → enqueue → écran d'attente (position + ETA, poll 3 s) → `ready` → appel `/collect` comme aujourd'hui → résultats. Le ticket survit au rafraîchissement de page (il est dans la session côté serveur, cookie inchangé).

### Calcul de l'ETA

`ETA = position × durée moyenne d'un parcours`. Moyenne suivie en EWMA (α≈0,2, amorce 8 s ≈ parcours 5 appels à 1/s + overhead). Suffisant : la position domine, et le chiffre s'auto-corrige au fil des parcours réels. Affichage arrondi vers le haut (« ~1 min », « ~2 min 30 »).

### Recalibrage du rate limiter (filet sous la file)

- `API_PARTICULIER_RATE=1`, `API_PARTICULIER_BUCKET_CAPACITY=2` (défauts dans `rate-limiter.ts` + `env.example.local`) — la file sérialise les parcours, le bucket cadence les appels À L'INTÉRIEUR d'un parcours à 1/s.
- `MAX_WAIT_MS` monté à ~20000 : dans un parcours, les 5 appels de base lancés en parallèle passent au goutte-à-goutte à 1/s → le dernier attend légitimement ~5 s ; idem pour la vague par enfant.
- Correction du bug 429 : le `RateLimitError` du SDK (`extends ApiGouvError`) doit être attrapé AVANT la branche générique dans `callResource` (`api-particulier.ts`), mappé vers la ligne « saturé » + audit `http_429`. (Les 429 deviendront rares une fois la file en place.)

## Fichiers

| Fichier | Changement |
|---|---|
| `src/app/services/queue.ts` (nouveau) | Lua ticket/serving/heartbeat/claim + `enqueue`, `getQueueStatus`, `claimTurn`, `releaseTurn`, EWMA |
| `src/app/v2/api/poc-fc-api-particulier/queue/route.ts` (nouveau) | POST enqueue |
| `src/app/v2/api/poc-fc-api-particulier/queue/status/route.ts` (nouveau) | GET status (poll) |
| `src/app/v2/api/poc-fc-api-particulier/collect/route.ts` | claim avant `callApiParticulierIdentite`, release dans `finally` |
| `src/app/v2/api/poc-fc-api-particulier/session.ts` | stocker `ticket` dans `PocResult`, helper de refresh TTL |
| `src/app/v2/poc-fc-api-particulier/components/PostLoginInfoForm.tsx` | UI d'attente : position + ETA, poll 3 s, puis collect |
| `src/app/services/rate-limiter.ts` + `env.example.local` | RATE 18→1, CAPACITY 18→2, MAX_WAIT 2500→20000 |
| `src/app/services/api-particulier.ts` | ordre des catch 429 |
| `tests/services/queue.test.ts` (nouveau) | FakeRedis : ordre FIFO, balayage tickets morts, expiration claim, ETA monotone, refus au-delà du plafond |

## Cas limites

- **Onglet fermé pendant l'attente** → heartbeat expire, le balayage du prochain poller saute le ticket ; personne ne bloque.
- **Conteneur mort en plein parcours** → le claim (TTL 60 s) expire, le balayage avance ; résultats partiels jetés (l'usager réessaye).
- **Session qui expirerait pendant l'attente** → le poll rafraîchit le TTL ; le refus d'enfiler au-delà de ~7 min d'ETA garantit que l'attente tient.
- **Rafraîchissement de page** → le ticket vit dans la session côté serveur (cookie inchangé), l'écran d'attente reprend à la bonne position.
- **Deux onglets, même session** → même ticket, les deux polls rafraîchissent le même heartbeat ; inoffensif.
- **Charge du polling** — une file de 50 personnes = ~17 req/s de polls sur notre propre Next.js, trivial ; chaque poll = 1–2 opérations Redis.

## Compromis

- **Série (K=1)** : rien de perdu à 1/s de quota. Si le quota augmente un jour, passer une constante `SERVING_WINDOW` à K parcours concurrents — la conception le supporte (position = ticket − serving fonctionne toujours, l'ETA divise par K).
- **Polling (3 s)** plutôt que SSE/WebSocket : compatible Scalingo, pas de connexions longues, code le plus simple. Une fraîcheur d'ETA à ±3 s est très suffisante à ces échelles de temps.
- **Le chiffre 60/min pilote tout** — confirmer le quota contractuel réel avant de livrer le recalibrage (`API_PARTICULIER_RATE` reste pilotée par env précisément pour ça).

## Vérification

1. `npx tsc --noEmit` ; `npx jest tests/services --runInBand`.
2. Local : `API_PARTICULIER_RATE=1`, ouvrir 3 sessions navigateur avec des identités de test FC → les sessions 2 et 3 affichent position + ETA décroissante, passent en ordre FIFO, résultats corrects.
3. Test d'abandon : fermer l'onglet d'une session en file → la position de la suivante baisse en ~15 s.
4. Test de crash : tuer le serveur dev en plein parcours, redémarrer → la file se débloque en moins de 60 s (TTL du claim).
