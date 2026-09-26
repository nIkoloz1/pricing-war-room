# The Pricing War Room

> *One market. Your price changes everyone's outcome.*

A live multiplayer pricing simulation for the QSTP **Pricing & Packaging for Startups** workshop. Up to 50 people join from their phones. Each person is the CEO of their own B2B startup, and everyone competes in **one shared market**. There are two scored rounds, one before the workshop and one after it. After each round, every participant sees their own **market share, revenue and profit**.

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
| `npm test` | 42 automated tests: market math, game-theory calibration, 1/2/5/10/20/50 players, sockets, reconnects, CSV |
| `npm run calibrate` | Prints each dossier's profit at every price, for rehearsal or re-tuning |

## Environment

Copy `.env.example`. The server reads real environment variables; your hosting provider sets these.

| Variable | Default | Meaning |
|---|---|---|
| `HOST_KEY` | `warroom` | Password for `/host` and the CSV exports. **Change it before going live.** |
| `PORT` | `3001` | Port for `npm start` (hosting platforms set this) |
| `DATA_FILE` | `./data/session.json` | Where the session is persisted |

## Running a session

1. Open `/host` and enter the host key. The dashboard updates live, so you never need to refresh it.
2. **Registration.** Put the QR code on screen with *Show QR full screen*. It links to `/?code=XXXX`. The 4-character **session code** is also shown for anyone typing the address by hand. Each person enters their name and immediately receives a codename and a sealed **confidential dossier** (one of 10 company profiles, dealt evenly and at random).
3. **Lock registration** when the room is in. *Start Round 1* also locks it. If fewer than 10 people joined, AI competitors fill the market up to 10 companies.
4. **Round 1.** The timer defaults to 120 s. Participants pick QAR 800 / 900 / 1,000 / 1,100 / 1,200 and lock it in. The round clears when everyone has submitted or the timer ends. Anyone who didn't submit stays at QAR 1,000. You can **Pause**, add **+30 s**, or **End round now**.
5. **Results.** With the default setting, each phone shows its private result as soon as the market clears. If you untick *Show results … as soon as the market clears*, a **Reveal** button appears so you can reveal on cue.
6. **Start workshop phase.** Teach the material. Phones keep the Round 1 result on screen.
7. **Start Round 2.** The timer defaults to 180 s. Each participant sees their Round 1 numbers, the Round 1 market (average price, % who cut, held or raised) and a **Strategy Sheet** filled in with their own margin, break-even, value-multiple and CLV figures. AI competitors react to what happened in Round 1.
8. **Show debrief** (host screen): room behavior, market outcome, **counterfactuals** (what if everyone held, cut or raised), strategic behavior, learning effect and a leaderboard. Names are hidden unless you tick *Show names*.
9. **Export:** *Players CSV* has one row per participant with every required column. *Market CSV* has the aggregates, counterfactuals and every competitor.

**Resetting.** *New session / reset* wipes everything and creates a new session code. Connected phones return to the join screen.

**Reconnects.** Each phone stores its player token in `localStorage`. After a refresh, a lost signal or a locked screen, it rejoins as the same player, with the same company, decision and results. It never creates a duplicate.

## Demo mode (rehearsal)

In registration, click **+10 / +20 / +50 simulated**. Simulated participants have real companies. They submit on their own during each round and choose according to their profile: price-sensitive companies lean low, premium ones lean high, and in Round 2 about half play a best response to Round 1. Each simulated participant has a **view** link in the participant list, so you can see exactly what their phone shows. You can also join from your own phone at the same time.

## Changing the simulation

| What | File |
|---|---|
| Market coefficients, timers, player caps, counterfactual scenarios | **`server/src/sim/params.ts`** |
| The 10 participant dossiers (economics and wording) | `server/src/sim/profiles.ts` |
| The 10 AI competitors and their Round 1 / Round 2 behaviour | `server/src/sim/ai.ts` |
| The market-clearing math | `server/src/sim/market.ts` |

After a change, run `npm test` (the calibration tests check conditions A to H from the spec) and `npm run calibrate`.

### The model (server-side only; participants never see it)

```
base_demand   = 100 × competitors
avg_price     = mean of all prices (humans + AI)
demand_factor = clamp(1 + 0.25 × (1000 − avg_price) / 1000, 0.85, 1.10)
total_demand  = base_demand × demand_factor
attractiveness_i = (value_i / 1000) × (price_i / 1000) ^ (−elasticity_i)
share_i       = attractiveness_i / Σ attractiveness
customers_i   = total_demand × share_i       (rounded to whole customers; totals still add up)
revenue_i     = customers_i × price_i
profit_i      = revenue_i − customers_i × variable_cost_i − fixed_cost_i
```

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
