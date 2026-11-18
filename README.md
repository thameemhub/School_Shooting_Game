# SQUAD SHOWDOWN

**▶ Play now: https://squad-showdown-production.up.railway.app**


A colorful 2D squad strategy game for 2–6 commanders, each leading **four soldiers** (up to 24 on the battlefield). React + TypeScript + SVG on the frontend, Node + Express + Socket.IO on the backend. Solo, pass-and-play, private rooms, and public matchmaking use the **same rules engine**. Players can put their own photo inside their soldiers' helmets.

## Run locally

Requires Node.js 20.19+ or 22+ and npm. From this directory:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite forwards multiplayer traffic to the Node server on port 3001. Open separate tabs or browsers to create separate player seats. Create a room, copy its code, join from another tab, ready up, and let the host start. Add bots to fill open seats.

For a production build, including offline reload support:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. This single process serves both the frontend and multiplayer endpoint. No API keys or database required.

```sh
npm test        # deterministic rules tests and real Socket.IO integration tests
npm run check  # strict TypeScript check
```

PowerShell supports these commands as written. Environment variables in `.env.example` are examples; set runtime variables in the shell or hosting dashboard. The server does not automatically load `.env`. Vite reads its usual `.env` files for build-time `VITE_*` values.

## Progression fix and animated introduction

The arena previously hid a newly unlocked part in temporary animation state until a timer fired. React Strict Mode could cancel that timer during effect cleanup while leaving the hidden state behind, making a soldier remain visually stuck at HEAD even though BODY was unlocked in the engine. The renderer now always uses authoritative soldier parts directly; animation effects are cosmetic only. Stable per-part keys ensure each new layer enters without replacing the soldier.

A regression test reproduces the original Strict Mode failure and now passes. Additional tests cover five consecutive successful matches on one soldier, persistent rendered SVG layers across misses and selection changes, loaded attack controls, and a real two-client five-stage progression. Raster tests confirm each added layer paints visible pixels in the correct region; `artifacts/progression-verified.png` shows the resulting five stages.

The 37-second **How to play** introduction uses the existing soldier and notebook components and walks through seven steps: 1) choose your soldier, 2) choose your lucky number, 3) open the notebook (real notebook animation, page 283), 4) match the last digit (3 = 3 match, 5 ≠ 7 miss, and the guaranteed retry), 5) build HEAD, BODY, FACE, GUN and BULLETS on one soldier, 6) SOLDIER 1 COMPLETE! NEXT: SOLDIER 2, 7) attack an opponent. Controls: Play intro, Pause/Resume, Skip intro, Start game. It appears before a first match, stores completion locally, and can be replayed from How to play. Online players watch it locally before joining/readying; it never sends tutorial turns or pauses the room. Demo pages are fixed only inside `src/tutorial.ts`. It respects existing audio and reduced-motion settings.

The game is deployed on Railway at https://squad-showdown-production.up.railway.app (one service serving the frontend and the Socket.IO server). It can also be served locally or deployed elsewhere using the instructions below.

## Playing

- **Play with friends:** create a private room, share the six-character code, add up to five other humans/bots. Non-host humans must ready up. Only the host starts or changes settings.
- **Play online:** joins an available public room on this server, or creates one. At least two seats and everyone ready starts automatically; the host can also start with ready guests. After the configured waiting period, the lobby offers adding bots. There is no simulated human matchmaking.
- **Solo vs bots:** choose 1–5 bot commanders, with easy/medium/hard decisions. Default is five medium bots. Each bot runs its own four-soldier squad.
- **Local multiplayer:** enter 2–6 names (each with an optional photo) and pass the device. Offline turns have no timer.

### Squads and the development notebook

Every commander controls four soldiers: **Assault, Scout, Defense, Support**. Roles are visual only: same rules, same ammunition, no special abilities. Each soldier develops independently through five stages: **HEAD → BODY → FACE (your photo) → GUN → BULLETS (3)**.

Each turn is **one action**: open the notebook for one soldier, or attack with one soldier.

- **Open the notebook:** the game picks your soldier for you (SOLDIER 1 → 2 → 3 → 4); tap another soldier or press **Switch** to develop a different one, and that choice is kept until it is complete. Choose your lucky number (1, 3, 5, 7 or 9) and press **OPEN NOTEBOOK**. One opening per turn, no retries. If the page's last digit **exactly equals** your lucky number, the soldier automatically unlocks its next stage in HEAD → BODY → FACE → GUN → BULLETS order (destroyed stages are skipped). A fully developed soldier with intact bullets and fewer than three can use a match to reload to three. If none of your soldiers can develop, any surviving soldier may still open the notebook so a turn is never stuck.
- **Assisted matching (deliberately not a uniform random page).** Each opening first decides the outcome: a **50% chance** to match, or a **guaranteed match** if that same soldier missed its previous opening. The server (or the offline engine) then draws a page from 1 to the maximum whose last digit agrees with the outcome: a page ending in your lucky number for a match, otherwise a page ending in one of the four other odd digits. The notebook never shows an even page. So a soldier never misses twice in a row, each part takes 1–2 turns (1.5 on average), and a whole soldier takes about 7–8 turns. The guarantee belongs to one soldier (`Soldier.assist`) and is shown in the panel as **GUARANTEED MATCH this turn!** Clients only send the soldier and lucky number; the server ignores any page or result fields, checks that every page agrees with its verdict, and runs the same rules for bots (`shared/numbers.ts: assistedPage`, `shared/development.ts`).
- **Attack:** choose one of your soldiers with an unlocked gun and bullets, an opponent, one of that opponent's surviving soldiers, and a body part: **Head, Body, Face, Gun or Bullets** (shooter and target can be picked in either order). One bullet destroys that part permanently, even if it was not developed yet.

Destroyed stages are **skipped** by later matches and never restored; destroying a built part does not reset progress. Built parts keep working: an intact loaded gun still fires after the head is destroyed. A destroyed gun disables that soldier's firing; destroyed bullets empty it and stop reloading.

A soldier with all five parts destroyed is defeated. A commander is eliminated only when **all four** soldiers are defeated. The last commander with a surviving soldier wins. If nobody can ever fire again, or the maximum round count is exceeded, surviving commanders rank by **score → intact completed parts → ammunition** (squad totals). Equal leaders share victory. Score: **+10 per unlocked part, +20 hit, +50 per soldier defeated**. Reloading never farms points.

**Pacing.** Two openings in three match in the long run. In simulated games the first shot now comes around round 8 (it was round 29 with the old 1-in-10 matching); two-bot games end by elimination around round 40. Six-squad games build every soldier quickly, but because hits are permanent and most bots keep reloading, they still often reach the 150-round limit and are decided on score. Lower *Maximum rounds* in settings for shorter sessions.

The arena shows compact squad cards (photo, team color, score, surviving soldiers such as 3/4, a five-segment progress bar and ammo per soldier, and a notebook icon). The command panel is kept minimal on your turn: the soldier being developed (SOLDIER n · role · NEXT part, with a Switch link), the five lucky-number buttons, **OPEN NOTEBOOK**, and **ATTACK** only once one of your soldiers is loaded. When a soldier finishes, a **SOLDIER 1 COMPLETE! NEXT: SOLDIER 2** banner appears and your next turn starts on that soldier. The panel also holds the shared notebook: every opening plays for every player (cover opens, pages flip, the page lands, the last digit is highlighted, the lucky number and digit slide together, then a green **MATCH FOUND** or red **NO MATCH** verdict) and the unlocked part appears on the soldier as the verdict lands.

**Visual construction.** Each soldier is drawn from five separate SVG layers (`src/components/Soldier.tsx`, tagged `data-part`), and a layer is drawn only once its part is unlocked: stage 0 is a faint placeholder silhouette; HEAD adds the head and helmet; BODY adds torso, arms, legs, uniform, gloves, backpack and boots; FACE adds the player's cropped photo inside the helmet (or a default face); GUN puts a gun in the front hand; BULLETS loads three rounds onto the gun (spent rounds turn grey). When a match unlocks a part, the authoritative soldier state is rendered immediately. The new SVG layer animates in with a yellow glow and an unlock callout. Animation timers never hide or rewrite unlocked parts. Destroyed parts stay visible as greyed, broken layers with red cracks and ✕ badges; later matches skip them. The tracker shows green ✓ UNLOCKED, grey ○ LOCKED/NEXT and red ✕ DESTROYED, with PROGRESS x/5 and NEXT UNLOCK. Selecting any soldier shows its development tracker (✓/○/✕ per part, progress x/5); its notebook icon opens a personal notebook with completed parts, next part, last lucky number, page and result, and full progress history. Automated turns wait three seconds after each opening so everyone can follow it. On phones the squads become a swipeable carousel with player tabs.

The victory screen provides rematches, rankings, full activity history and main menu access. The last 15 finished matches (stored **without** photos) and the most recent offline match are kept on this device; history can be cleared from the history dialog.

### Player photos

Use **UPLOAD YOUR PHOTO** on the home screen, in the profile/settings dialog, in the room setup dialog or in the lobby. JPG, JPEG, PNG and WEBP up to 8 MB (64–8192 px per side) are accepted. The photo is decoded, cropped (drag, zoom and reposition inside a helmet-shaped guide) and reduced to a 160×160 JPEG **in the browser**; the original file never leaves the device. That portrait is drawn inside every soldier's helmet as an SVG image layer, so it moves with all animations. There is no face recognition and no AI alteration.

Offline, the portrait stays in this browser's local storage. Online, the server accepts only a small JPEG data URL, re-decodes and re-encodes it with `sharp` (rejecting SVG, URLs and oversized images), keeps it **in memory** inside the room only, and shares it only with that room's players. It disappears when the room is removed. **Remove photo** deletes it from the profile, the active room and the saved offline match.

### Music & sound

The soundtrack and all effects are **original and synthesized live with the Web Audio API** (`src/sound.ts`); no recordings or third-party music are bundled. One continuous song plays across menus, lobbies and battles; entering a battle only fades in a percussion layer, so navigation never restarts it. Separate cues play for the notebook opening, page flipping, a match chime, a mismatch buzz, unlocking a part, loading bullets, firing, impacts, soldier defeat and victory. Settings: background music on/off and volume, sound effects on/off and volume, all saved locally. Playback starts after the first click or key press, as browsers require, and pauses while the tab is hidden.

Other settings include nickname, reduced motion, night mode, page maximum, round limit, bot delay/difficulty, online turn timer, disconnect grace period, and public matchmaking wait. Online match settings are host-controlled and lock at match start.

## Offline behavior

Solo and local play do not connect to the server. After loading they keep working without internet. Production builds generate a service worker that precaches all required assets; once its installation completes, reloading while offline works too. Reopen the app and select **Resume** to continue the saved offline match.

Offline caching requires **HTTPS or localhost**, as required by browsers. Vite development mode intentionally does not register the service worker. There are no remote fonts, images, audio files or CDN dependencies. Music and sound are synthesized locally and start after a user gesture. Motion respects both the in-game setting and the OS reduced-motion preference.

## Deploy online

The backend is a long-running Socket.IO server, so it needs a host that keeps processes and WebSockets alive. The simplest correct setup is **one service that serves both the built frontend and the backend on the same HTTPS origin** (WSS then works automatically, no CORS setup).

### Railway (recommended, config included)

`railway.json` builds the `Dockerfile` with `/health` checks and a single replica.

```sh
npx @railway/cli login          # opens a browser to authorize
npx @railway/cli init -n squad-showdown
npx @railway/cli up --detach    # uploads this folder and builds the Dockerfile
npx @railway/cli domain         # creates the public https://….up.railway.app URL
```

### Render (config included)

`render.yaml` is a Blueprint for one Docker web service with `/health`. Push the project to a Git repository, then in Render choose **New → Blueprint** and select the repository. Free instances sleep when idle; the first visit after sleeping takes a little longer.

### Vercel frontend + separate backend (optional)

Vercel cannot host the Socket.IO server. If you want the frontend there anyway, deploy the backend on Railway/Render as above, then deploy the frontend on Vercel (`vercel.json` included) with the build-time variable `VITE_SERVER_URL=https://<backend-host>` and set `ALLOWED_ORIGIN=https://<your-vercel-domain>` on the backend. Rebuild the frontend whenever `VITE_SERVER_URL` changes.

### Any long-running Node web service

1. Upload/push this project, excluding `node_modules` and local `.env` files.
2. Use Node 22+, build command `npm ci && npm run build`, start command `npm start` (or build the `Dockerfile`).
3. Set `NODE_ENV=production`. The service supplies `PORT`; the fallback is 3001.
4. Enable WebSocket upgrades and HTTP long-polling. Use `/health` as the health-check path.
5. Use a **single instance**. Give every player the same HTTPS application URL.

### Docker

```sh
docker build -t squad-showdown .
docker run --rm -p 3001:3001 --name squad-showdown squad-showdown
```

The image builds on Debian (`node:22-bookworm-slim`, because Rollup's native parser overflows its stack under Alpine/musl) and runs on `node:22-alpine` as the unprivileged `node` user. It was built and smoke-tested locally: health check, frontend, Socket.IO, photo re-encoding with `sharp`, and a server-generated notebook opening. Put an HTTPS reverse proxy in front for internet access and set its idle timeout above 60 seconds.

### Same-network testing

Both dev servers bind to `0.0.0.0`. Use the host computer's LAN address and the appropriate port on another device. Your OS firewall must allow that port. Plain HTTP on a LAN supports gameplay but not service-worker offline reload; use HTTPS for that feature.

## Networking and operational boundaries

- Server generates online pages and validates ownership, expected state revision, active turn, the chosen soldier (must be the acting player's, alive and able to develop), the lucky number (1/3/5/7/9 only), the shooting soldier, the target player, soldier and body part, ammunition and room permissions. **Notebook pages are generated only on the server**; any page, digit or match value a client sends is ignored, and the server decides which part unlocks. A client can never develop or fire another player's soldiers. Client bullet counts, page values and player IDs do not grant authority.
- Every accepted move increments the revision. Stale/duplicate moves are rejected, including repeated even-page requests with the same revision.
- Reconnect credentials are cryptographically random server-generated tokens stored in tab-local `sessionStorage`. They are never included in room broadcasts. Reloading the same tab restores its seat. A duplicated browser tab may inherit session storage; that resumes the original seat and disconnects its previous socket. Open a fresh tab or separate browser for another player.
- Disconnected seats are reserved; after the host-configured grace period, the server plays those turns as a bot. Reconnecting returns control to the player. Explicitly leaving a running match permanently hands that seat to a bot.
- A disconnected host transfers ownership to a connected human after the grace period. Rooms with all humans disconnected are removed after five minutes. Rooms with no human seats are removed immediately.
- Rooms and reconnect tokens are **in memory**: restarting the server ends active online matches. Browser history remains. Horizontal scaling would require shared durable room state, routing and a cross-instance Socket.IO adapter; those are not part of this initial implementation.
- Socket payload size and per-socket request rates are bounded. For large public deployment, add infrastructure-level abuse protection and monitoring.
- The online timer is enforced by the server; the displayed countdown uses the device clock, so seriously incorrect local clocks can show an inaccurate countdown without affecting authority.

## Project structure

```text
src/
  App.tsx                 Menus, lobbies, profile/settings, history and mode orchestration
  components/
    Arena.tsx             Squad cards, develop/attack controls, trackers, soldier notebooks, effects, victory
    Notebook.tsx          Animated development notebook (flip, page, digit match verdict)
    Modal.tsx             Accessible dialog
    Soldier.tsx           Layered SVG cartoon soldier (per-part unlock/damage, photo face) + avatar
    PhotoEditor.tsx       Local photo validation, crop/zoom/pan and squad preview
    Icon.tsx              Interface icons
    Settings.tsx          Preferences type and shared rules fields
  network.ts              Socket client and acknowledged commands
  sound.ts                Original synthesized soundtrack and sound effects
  style.css               Baby Blue / Indigo / Bumblebee Yellow / Amber Red theme, responsive layout, animations
shared/
  types.ts                Serializable state: Game -> Player -> 4 Soldier records with named parts (schema 3)
  engine.ts               Pure validated actions and new-game construction
  character.ts            Soldier/squad progression, eligibility and capability
  development.ts          Notebook openings: lucky number vs. server-generated page, stage unlocks
  numbers.ts              Random page and last-digit rules
  guns.ts                 Soldier-to-soldier attack validation, ammunition and damage
  turns.ts                Sequential turns and timeouts
  bots.ts                 Three difficulty policies controlling whole squads
  win.ts                  Soldier/squad elimination, stalemates, ranking and round cap
  history.ts              Structured turn events
server/
  app.ts                  Socket commands, authoritative ticker and HTTP host
  avatars.ts              Photo validation and re-encoding
  rooms.ts                Room creation, joining and start validation
  matchmaking.ts          Public-room pooling
  players.ts              Secret reconnect sessions and lifecycle
  index.ts                Startup and graceful shutdown
scripts/build-offline.mjs  Versioned production service-worker generation
tests/                    Rules and independent socket-client tests
Dockerfile                Single-service production container
```

Saved matches from earlier versions (schemas 1 and 2) are ignored safely on load.

## Verification

`npm test` runs 19 tests. Rules tests cover page generation; 24 distinct soldiers in a six-player match; only 1/3/5/7/9 accepted, for your own soldier, on your turn; mismatches (wrong odd and even digits) unlocking nothing and ending the turn with no retries; the exact head → body → face → gun → bullets sequence from the example script; reusing a lucky number; destroyed stages being skipped and never restored; reloads; a squad with nothing left to do still having a legal move; body-part attacks and their validation; gun/bullets destruction; soldier defeat versus squad elimination; stalemates, ties, round limits, timeouts and rematches; and complete six-bot matches at all difficulties, checking that every opening is consistent and the observed match rate is about 1 in 10 (no guaranteed matches). Integration tests connect six independent sockets to a real HTTP server and verify room capacity, host-only controls, refusing to fire another player's soldier, duplicate attacks, identical broadcasts, reconnect restoring squad state, **server-generated notebook pages ignoring a forged page/match from the client**, a genuine match unlocking the head on every device, public matchmaking, bots, disconnect takeover, host transfer, room cleanup, and photo validation/sync/removal.

Browser checks (Chrome, production build) covered the full notebook flow (OPEN NOTEBOOK disabled until a number is chosen, flip animation, highlighted digit, match and mismatch verdicts, part revealed on the verdict), one opening per turn across 37 openings, body-part attacks, the soldier notebook dialog, a 390 px phone layout without horizontal overflow, and two browsers in a private room seeing the identical notebook result.

At implementation time, `npm audit --omit=dev` reports zero production vulnerabilities. The full audit flags the Vite tooling's transitive `picomatch` dependency (GHSA-fc5q-39xc-vjpf); the configured registry currently offers no fixed release and `npm audit fix` cannot resolve it. It is not installed in the production Docker runtime. Recheck dependency updates before operating a public development server; expose the production server instead.
