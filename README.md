# The Pricing War Room

> *One market. Your price changes everyone's outcome.*

A live multiplayer pricing simulation for the QSTP **Pricing & Packaging for Startups** workshop. Up to 50 people join from their phones. Each person is the CEO of one of ten B2B companies, each with its own customers, costs and demand curve. Players compete in **parallel markets of ten**: one company of each type per market, with AI filling any gaps. There are two scored rounds. Round 1 tests value-based and CLV pricing from the dossier. Round 2 tests game theory: who is my real competitor, and how should I respond? Players are scored on **profit** and on **market share change** from where they started.

- **Participants:** `https://your-domain/` (mobile-first; they join by QR code)
- **Host dashboard:** `https://your-domain/host` (desktop, password protected with `HOST_KEY`)

---

## Quick start (local)

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

- Participant screen: http://localhost:5173
- Host dashboard: http://localhost:5173/host. The dev host key is `warroom` unless you set `HOST_KEY`.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | API server (port 3001, auto-reload) plus the Vite client (port 5173) |
| `npm run build` | Type-checks, then builds the client to `dist/client` and the server to `dist/server.js` |
| `npm start` | Runs the production build on `PORT` (default 3001), serving both the game and the API |
| `npm test` | Automated tests: the engine's calibrated numbers, market assignment, the Round 2 quiz gating, 1 to 50 players, sockets, reconnects, persistence, CSV |
| `npm run calibrate` | Prints derived coefficients, best responses, the similarity matrix and whole-market scenarios, for rehearsal or re-tuning |

## Environment

Copy `.env.example`. The server reads real environment variables; your hosting provider sets these.

| Variable | Default | Meaning |
|---|---|---|
| `HOST_KEY` | `warroom` | Password for `/host` and the CSV exports. **Change it before going live.** |
| `PORT` | `3001` | Port for `npm start` (hosting platforms set this) |
| `DATA_FILE` | `./data/session.json` | Where the session is persisted |

## Running a session

1. Open `/host` and enter the host key. The dashboard updates live, so you never need to refresh it.
2. **Registration.** Put the QR code on screen with *Show QR full screen*. It links to `/?code=XXXX`. The 4-character **session code** is also shown for anyone typing the address by hand. Each person enters their name and immediately receives a codename and a sealed **confidential dossier**. Each block of ten joiners gets one of each of the 10 companies, in random order.
3. **Lock registration** when the room is in. *Start Round 1* also locks it and builds the markets. Market *m* gets the *m*-th player of each company type, so the number of markets is the largest number of players holding the same dossier. With 1 to 10 players that is usually one market. AI companies with identical economics fill every empty seat, so each market always has exactly ten companies, one of each type.
4. **Round 1** (default 240 s). Participants price from their dossier alone, choosing from a 4×4 grid of QAR 700 to 1,450 in steps of 50. The dossier teaches two routes to the same right price: economic value (max willingness to pay and variable cost) and CLV (customers × lifetime value per row of the demand table). The round clears when everyone has submitted or the timer ends. Anyone who didn't submit stays at QAR 1,000. You can **Pause**, add **+30 s**, or **End round now**.
5. **Results.** Each phone shows profit (Profitable / Loss), share change in points vs the starting share, customers, the dossier right price, the best price given what competitors actually did, and every competitor in the market with its price and **similarity**. With the default setting, results appear as soon as the market clears. If you untick *Show results … as soon as the market clears*, a **Reveal** button appears so you can reveal on cue.
6. **Start workshop phase.** Teach the material. Phones keep the Round 1 result on screen.
7. **Start Round 2** (default 300 s). Each participant works through a three-step desk:
   1. **Quiz:** "Who was your primary competitor for market share in Round 1?" There are four options, the most similar rivals, always including the right answer. Only after answering do they see the true customer flows ("won 7 from X, lost 12 to Y").
   2. **Best response:** a table of their best price against the likely moves of that competitor, holding everyone else at Round 1 prices, plus how strongly that rival's price moves theirs.
   3. **Price:** the grid unlocks once the quiz is answered. Anyone who doesn't submit keeps their Round 1 price. AI competitors react to Round 1 according to their personalities.
8. **Show debrief** (host screen). It has six parts:
   - the **profit vs share-change quadrant** (value-led growth, harvesting, buying share, value problem);
   - what the room learned: % at the dossier right price in Round 1, % who named their primary competitor, and median profit captured in Round 1 vs Round 2;
   - **counterfactuals** summed across markets: everyone holds, everyone at their right price, and right prices with the SMB cluster cutting 100;
   - price moves;
   - a per-market table;
   - a sortable leaderboard (profit first, share change beside it). Names are hidden unless you tick *Show names*.
9. **Export:** *Players CSV* has one row per participant. It includes market, right price, share change, best price given competitors, profit captured, primary competitor, the quiz answer and whether it was correct. *Market CSV* has per-market and room aggregates, counterfactuals and every competitor.

**Resetting.** *New session / reset* wipes everything and creates a new session code. Connected phones return to the join screen.

**Reconnects.** Each phone stores its player token in `localStorage`. After a refresh, a lost signal or a locked screen, it rejoins as the same player, with the same company, decision and results. It never creates a duplicate.

## Demo mode (rehearsal)

In registration, click **+10 / +20 / +50 simulated**. Simulated participants have real companies and play on their own.
- **Round 1:** 45% pick their right price, 20% hold at 1,000, and the rest miss by 100 to 200.
- **Round 2:** they answer the quiz first, correctly 60% of the time. Then half play a best response, a quarter keep their price, and a quarter drift toward their rival. Each simulated participant has a **view** link in the participant list, so you can see exactly what their phone shows. You can also join from your own phone at the same time.

## Changing the simulation

| What | File |
|---|---|
| Similarity (KAPPA), switching strength (LAMBDA), price grid, timers, player cap | **`server/src/sim/params.ts`** |
| The 10 companies: costs, right price, starting customers, churn, map position, EVE lines, AI name and personality | `server/src/sim/companies.ts` |
| AI personalities and demo bots | `server/src/sim/ai.ts` |
| The demand and switching engine | `server/src/sim/market.ts` |

After a change, run `npm test` (the engine tests pin every calibrated number) and `npm run calibrate`.

### How the market works (plain language)

Each company has its **own demand curve**. Its best-fit customers would pay at most its *max willingness to pay*, which the dossier builds as the going rate plus differentiation minus value lost. Below that, customers' willingness to pay is spread evenly, so every QAR you raise loses a steady number of customers. Each company's numbers are set so that, **if everyone else stays at 1,000**, its most profitable price is its dossier **right price**, which sits halfway between its max willingness to pay and its variable cost. The CLV route lands on the same price.

Some of the customers you lose by raising your price simply stop buying. The rest **switch to similar competitors**. Every company sits on a map of the market, and similarity falls off with distance: `similarity = exp(-3 x distance)`. Switching between two companies is proportional to their similarity and to the **price gap** between them, and it is symmetric, so customers are conserved. In practice:

- Near-twins like the three SMB self-serve tools (SwiftOps, ScaleAI, LaunchAI) steal customers from each other with every price move. Undercutting each other is a prisoner's dilemma: all three end up worse off.
- Differentiated companies such as MedFlow (healthcare) barely feel anyone else's price. Their best price hardly moves.
- A company's **primary competitor** in a round is the rival it traded the most customers with, which comes from similarity × price gap, not from similarity alone.

Whole customers are paid out (revenue = customers × price; profit = customers × (price − variable cost) − fixed cost). Everyone at 1,000 reproduces each company's starting customers exactly, so the share change is measured against that starting point.

## Deployment (productbeans.com)

The game needs a small always-on Node server with WebSocket support. Static hosts such as Netlify or GitHub Pages **won't work**. The simplest route has no command line at all:

### Render (recommended)

1. Push this repo to GitHub.
2. Go to render.com and choose **New → Blueprint**, then pick the repo. `render.yaml` configures everything: build, start, health check, a 1 GB disk for `session.json`, and a randomly generated `HOST_KEY`.
3. Once it's live, open the service's **Environment** tab to see or change `HOST_KEY`.
4. **Custom domain:** go to **Settings → Custom Domains → Add** and enter, for example, `warroom.productbeans.com` (or the bare `productbeans.com`). Render shows the exact DNS record to add at your domain registrar: a **CNAME** to `your-service.onrender.com` for a subdomain, or an **A record** for the bare domain. HTTPS is issued automatically.

The `starter` plan stays awake. The free plan sleeps after 15 idle minutes and has no persistent disk. If you use it, open `/host` a few minutes before the session to wake it up.

### Any Docker host (e.g. a VPS)

```bash
docker build -t pricing-war-room .
docker run -d -p 3001:3001 -e HOST_KEY=your-secret -v war-room-data:/app/data pricing-war-room
```

Put an HTTPS proxy (Caddy is the easiest) in front of it. If a proxy sits in front, it must forward WebSocket upgrades.

### Local tunnelling (no deployment)

Run the game on your laptop and expose it:

```bash
npm run build
npm start
```

Then, in a second terminal, run `npx localtunnel --port 3001` or `cloudflared tunnel --url http://localhost:3001`. The QR code on the host dashboard uses whatever address you opened `/host` on, so open the dashboard through the tunnel URL.

## Architecture

```
client/                 React + TypeScript + Vite
  src/participant/      join → sealed dossier → decision → locked → results (mobile-first)
  src/host/             host dashboard, debrief, SVG charts (desktop-first)
server/src/
  game.ts               authoritative state machine (phases, timers, AI, results, debrief, CSV)
  app.ts                Express + Socket.IO wiring, host auth, CSV endpoints
  store.ts              atomic JSON persistence (data/session.json)
  sim/                  params, profiles, AI personalities, market math
shared/types.ts         types shared by server and client
tests/                  vitest: calibration, game rules, socket protocol
```

- **Server-authoritative.** The browser only sends `{token, price}`. Identity, timers, AI, market clearing and rankings all live on the server. Participants receive only their own results and the public market summary, never another company's economics.
- **One process, one session.** State is saved to `data/session.json` after every change and restored on restart, including a running timer.
- **Deterministic.** Every session has a seed, so AI decisions and dossier assignment can be reproduced in testing.
- No database, no external services, no analytics. Fonts are bundled.
