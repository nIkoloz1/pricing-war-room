import { randomBytes, randomUUID } from 'node:crypto';
import {
  PRICE_OPTIONS,
  type CompetitorResult,
  type Debrief,
  type Economics,
  type HostAction,
  type HostView,
  type MyRoundResult,
  type Phase,
  type PlayerView,
  type Price,
  type PublicMarketInfo,
  type RoundNo,
  type RoundRecord,
  type TimerState,
} from '../../shared/types';
import {
  AI_ARCHETYPES,
  aiRound1Decision,
  aiRound2Decision,
  demoRound1Decision,
  demoRound2Decision,
  round2Context,
} from './sim/ai';
import { clearMarket, rngFor, type MarketEntry } from './sim/market';
import {
  COUNTERFACTUALS,
  DEFAULT_PRICE,
  MAX_HUMANS,
  MIN_COMPETITORS,
  REFERENCE_PRICE,
  ROUND1_SECONDS,
  ROUND2_SECONDS,
} from './sim/params';
import { PROFILES, PROFILE_BY_ID, codenameFor } from './sim/profiles';

// ============================================================================
//  Game: the authoritative state machine. No sockets in here, so it can be
//  driven directly by tests with a fake clock.
// ============================================================================

export interface StoredPlayer {
  id: string;
  token: string;
  name: string;
  codename: string;
  profileId: string;
  isDemo: boolean;
  joinedAt: number;
}

export interface StoredAi extends Economics {
  id: string;
  name: string;
  archetypeIndex: number;
  archetype: string;
}

export interface SessionState {
  version: 1;
  sessionId: string;
  code: string;
  seed: string;
  createdAt: number;
  phase: Phase;
  registrationOpen: boolean;
  timer: TimerState | null;
  autoReveal: boolean;
  r1Seconds: number;
  r2Seconds: number;
  players: StoredPlayer[];
  ai: StoredAi[];
  decisions: Record<'1' | '2', Record<string, Price>>;
  aiDecisions: Record<'1' | '2', Record<string, Price>>;
  rounds: Partial<Record<'1' | '2', RoundRecord>>;
  demoSchedule: { playerId: string; round: RoundNo; at: number; price: Price }[];
}

export interface Store {
  load(): SessionState | null;
  save(state: SessionState): void;
}

export class GameError extends Error {}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(): string {
  const bytes = randomBytes(4);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function freshSession(now: number, seed?: string, prev?: SessionState): SessionState {
  return {
    version: 1,
    sessionId: randomUUID(),
    code: makeCode(),
    seed: seed ?? randomBytes(8).toString('hex'),
    createdAt: now,
    phase: 'registration',
    registrationOpen: true,
    timer: null,
    autoReveal: prev?.autoReveal ?? true,
    r1Seconds: prev?.r1Seconds ?? ROUND1_SECONDS,
    r2Seconds: prev?.r2Seconds ?? ROUND2_SECONDS,
    players: [],
    ai: [],
    decisions: { '1': {}, '2': {} },
    aiDecisions: { '1': {}, '2': {} },
    rounds: {},
    demoSchedule: [],
  };
}

const DECISION_PHASE: Record<RoundNo, Phase> = { 1: 'r1_decision', 2: 'r2_decision' };
const CLEARING_PHASE: Record<RoundNo, Phase> = { 1: 'r1_clearing', 2: 'r2_clearing' };
const RESULTS_PHASE: Record<RoundNo, Phase> = { 1: 'r1_results', 2: 'r2_results' };

export function isRevealed(phase: Phase, round: RoundNo): boolean {
  if (round === 1) return ['r1_results', 'workshop', 'r2_decision', 'r2_clearing', 'r2_results', 'debrief'].includes(phase);
  return ['r2_results', 'debrief'].includes(phase);
}

export function currentRound(phase: Phase): RoundNo | null {
  if (phase === 'r1_decision') return 1;
  if (phase === 'r2_decision') return 2;
  return null;
}

export interface GameOptions {
  now?: () => number;
  store?: Store;
  seed?: string;
  /** Demo bots submit between these fractions of the round timer. */
  demoWindow?: [number, number];
}

export class Game {
  state: SessionState;
  private now: () => number;
  private store?: Store;
  private demoWindow: [number, number];
  private listeners = new Set<() => void>();
  connected = new Set<string>();

  constructor(opts: GameOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.store = opts.store;
    this.demoWindow = opts.demoWindow ?? [0.04, 0.35];
    this.state = this.store?.load() ?? freshSession(this.now(), opts.seed);
    this.persist();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.persist();
    for (const fn of this.listeners) fn();
  }

  private persist() {
    this.store?.save(this.state);
  }

  // --------------------------------------------------------------------------
  //  Participants
  // --------------------------------------------------------------------------
  get humans(): StoredPlayer[] {
    return this.state.players;
  }

  get totalCompetitors(): number {
    return Math.max(this.humans.length, MIN_COMPETITORS);
  }

  playerByToken(token: unknown): StoredPlayer | undefined {
    if (typeof token !== 'string' || !token) return undefined;
    return this.state.players.find((p) => p.token === token);
  }

  join(rawName: unknown, rawCode: unknown, isDemo = false): StoredPlayer {
    const s = this.state;
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (!isDemo && code !== s.code) throw new GameError('That session code is not active. Check the code on the screen.');
    if (s.phase !== 'registration' || !s.registrationOpen) throw new GameError('Registration closed.');
    if (s.players.length >= MAX_HUMANS) throw new GameError(`The market is full (${MAX_HUMANS} participants).`);
    const name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) throw new GameError('Please enter your name.');

    const index = s.players.length;
    const player: StoredPlayer = {
      id: `P${String(index + 1).padStart(2, '0')}-${randomBytes(2).toString('hex')}`,
      token: randomBytes(18).toString('base64url'),
      name,
      codename: codenameFor(index, rngFor(s.seed, 'codename', index)),
      profileId: this.profileForIndex(index),
      isDemo,
      joinedAt: this.now(),
    };
    s.players.push(player);
    this.changed();
    return player;
  }

  /** Balanced random assignment: each block of 10 players gets all 10 dossiers, shuffled. */
  private profileForIndex(index: number): string {
    const block = Math.floor(index / PROFILES.length);
    const rand = rngFor(this.state.seed, 'deck', block);
    const order = PROFILES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return PROFILES[order[index % PROFILES.length]].id;
  }

  submit(token: unknown, rawPrice: unknown): { price: Price; duplicate: boolean } {
    const player = this.playerByToken(token);
    if (!player) throw new GameError('Unknown player. Please rejoin.');
    const round = currentRound(this.state.phase);
    if (!round) throw new GameError('Decisions are not open right now.');
    const price = Number(rawPrice);
    if (!PRICE_OPTIONS.includes(price as Price)) throw new GameError('Invalid price.');
    const existing = this.state.decisions[round][player.id];
    if (existing !== undefined) return { price: existing, duplicate: true };
    this.state.decisions[round][player.id] = price as Price;
    this.state.demoSchedule = this.state.demoSchedule.filter((d) => d.playerId !== player.id);
    if (this.allSubmitted(round)) this.resolve(round);
    else this.changed();
    return { price: price as Price, duplicate: false };
  }

  private allSubmitted(round: RoundNo): boolean {
    const d = this.state.decisions[round];
    return this.humans.length > 0 && this.humans.every((p) => d[p.id] !== undefined);
  }

  // --------------------------------------------------------------------------
  //  Timers
  // --------------------------------------------------------------------------
  private remaining(t: TimerState): number {
    return t.paused || t.endsAt === null ? t.remainingMs : Math.max(0, t.endsAt - this.now());
  }

  /** Call regularly (the server does every 250ms). */
  tick(): void {
    const s = this.state;
    const round = currentRound(s.phase);
    if (!round) return;
    const now = this.now();
    const due = s.demoSchedule.filter((d) => d.round === round && d.at <= now && !s.timer?.paused);
    for (const d of due) {
      const p = s.players.find((x) => x.id === d.playerId);
      if (p && s.decisions[round][p.id] === undefined) {
        this.submit(p.token, d.price);
        if (currentRound(this.state.phase) !== round) return;
      }
    }
    if (due.length) {
      s.demoSchedule = s.demoSchedule.filter((d) => !due.includes(d));
      this.changed();
    }
    if (s.timer && !s.timer.paused && s.timer.endsAt !== null && now >= s.timer.endsAt) {
      this.resolve(round);
    }
  }

  // --------------------------------------------------------------------------
  //  Rounds
  // --------------------------------------------------------------------------
  private createAi() {
    const s = this.state;
    const count = Math.max(0, MIN_COMPETITORS - s.players.length);
    s.ai = AI_ARCHETYPES.slice(0, count).map((a, i) => ({
      id: `AI${String(i + 1).padStart(2, '0')}`,
      name: a.name,
      archetypeIndex: i,
      archetype: a.archetype,
      customerValue: a.customerValue,
      elasticity: a.elasticity,
      variableCost: a.variableCost,
      fixedCost: a.fixedCost,
    }));
  }

  private startRound(round: RoundNo) {
    const s = this.state;
    if (round === 1) {
      if (s.phase !== 'registration') throw new GameError('Round 1 can only start from registration.');
      if (s.players.length === 0) throw new GameError('At least one participant must join first.');
      s.registrationOpen = false;
      this.createAi();
      s.aiDecisions['1'] = Object.fromEntries(
        s.ai.map((a) => [a.id, aiRound1Decision(s.seed, a.id, AI_ARCHETYPES[a.archetypeIndex])]),
      );
    } else {
      if (!['r1_results', 'workshop', 'r1_clearing'].includes(s.phase)) {
        throw new GameError('Round 2 can start after Round 1 has been revealed.');
      }
      if (!s.rounds['1']) throw new GameError('Round 1 has not been resolved.');
      const r1 = s.rounds['1'];
      const entries = this.entriesFor(1);
      s.aiDecisions['2'] = Object.fromEntries(
        s.ai.map((a) => [
          a.id,
          aiRound2Decision(s.seed, a.id, AI_ARCHETYPES[a.archetypeIndex], round2Context(r1, entries, a.id)),
        ]),
      );
    }
    const seconds = round === 1 ? s.r1Seconds : s.r2Seconds;
    const durationMs = seconds * 1000;
    s.decisions[round] = {};
    s.phase = DECISION_PHASE[round];
    s.timer = { durationMs, endsAt: this.now() + durationMs, remainingMs: durationMs, paused: false };
    this.scheduleDemo(round, durationMs);
    this.changed();
  }

  private scheduleDemo(round: RoundNo, durationMs: number) {
    const s = this.state;
    const r1 = s.rounds['1'];
    const entries = round === 2 ? this.entriesFor(1) : [];
    const [lo, hi] = this.demoWindow;
    s.demoSchedule = s.players
      .filter((p) => p.isDemo)
      .map((p) => {
        const e = PROFILE_BY_ID[p.profileId];
        const price =
          round === 1
            ? demoRound1Decision(s.seed, p.id, e)
            : demoRound2Decision(s.seed, p.id, e, round2Context(r1!, entries, p.id));
        const r = rngFor(s.seed, 'demo-delay', p.id, round)();
        return { playerId: p.id, round, price, at: this.now() + durationMs * (lo + (hi - lo) * r) };
      });
  }

  /** Market entries for a round using the decisions (or defaults) of that round. */
  entriesFor(round: RoundNo, override?: (e: MarketEntry) => Price): MarketEntry[] {
    const s = this.state;
    const human: MarketEntry[] = s.players.map((p) => {
      const prof = PROFILE_BY_ID[p.profileId];
      const decided = s.decisions[round][p.id];
      return {
        id: p.id,
        kind: 'human',
        customerValue: prof.customerValue,
        elasticity: prof.elasticity,
        variableCost: prof.variableCost,
        fixedCost: prof.fixedCost,
        price: decided ?? (DEFAULT_PRICE as Price),
        defaulted: decided === undefined,
      };
    });
    const ai: MarketEntry[] = s.ai.map((a) => ({
      id: a.id,
      kind: 'ai',
      customerValue: a.customerValue,
      elasticity: a.elasticity,
      variableCost: a.variableCost,
      fixedCost: a.fixedCost,
      price: s.aiDecisions[round][a.id] ?? (DEFAULT_PRICE as Price),
    }));
    const all = [...human, ...ai];
    return override ? all.map((e) => ({ ...e, price: override(e), defaulted: false })) : all;
  }

  private resolve(round: RoundNo) {
    const s = this.state;
    if (s.phase !== DECISION_PHASE[round]) return;
    const outcome = clearMarket(this.entriesFor(round));
    s.rounds[round] = {
      round,
      resolvedAt: this.now(),
      humans: s.players.length,
      ...outcome,
    };
    s.timer = null;
    s.demoSchedule = [];
    s.phase = s.autoReveal ? RESULTS_PHASE[round] : CLEARING_PHASE[round];
    this.changed();
  }

  // --------------------------------------------------------------------------
  //  Host
  // --------------------------------------------------------------------------
  hostAction(action: HostAction): void {
    const s = this.state;
    const round = currentRound(s.phase);
    switch (action.type) {
      case 'reset':
        this.state = freshSession(this.now(), undefined, s);
        this.changed();
        return;
      case 'openRegistration':
        if (s.phase !== 'registration') throw new GameError('Registration can only be reopened before Round 1.');
        s.registrationOpen = true;
        break;
      case 'lockRegistration':
        s.registrationOpen = false;
        break;
      case 'startRound':
        return this.startRound(action.round);
      case 'pause':
        if (!round || !s.timer || s.timer.paused) throw new GameError('Nothing to pause.');
        s.timer = { ...s.timer, remainingMs: this.remaining(s.timer), endsAt: null, paused: true };
        {
          const now = this.now();
          s.demoSchedule = s.demoSchedule.map((d) => ({ ...d, at: d.at - now })); // store as offsets while paused
        }
        break;
      case 'resume':
        if (!round || !s.timer || !s.timer.paused) throw new GameError('Timer is not paused.');
        {
          const now = this.now();
          s.timer = { ...s.timer, endsAt: now + s.timer.remainingMs, paused: false };
          s.demoSchedule = s.demoSchedule.map((d) => ({ ...d, at: d.at + now }));
        }
        break;
      case 'addTime': {
        if (!round || !s.timer) throw new GameError('No round is running.');
        const ms = Math.round(Number(action.seconds) * 1000);
        if (!Number.isFinite(ms)) throw new GameError('Invalid time.');
        const remainingMs = Math.max(1000, this.remaining(s.timer) + ms);
        s.timer = s.timer.paused
          ? { ...s.timer, remainingMs, durationMs: Math.max(s.timer.durationMs, remainingMs) }
          : { ...s.timer, endsAt: this.now() + remainingMs, remainingMs, durationMs: Math.max(s.timer.durationMs, remainingMs) };
        break;
      }
      case 'endRound':
        if (!round) throw new GameError('No round is running.');
        return this.resolve(round);
      case 'reveal':
        if (s.phase === 'r1_clearing') s.phase = 'r1_results';
        else if (s.phase === 'r2_clearing') s.phase = 'r2_results';
        else throw new GameError('Nothing to reveal.');
        break;
      case 'startWorkshop':
        if (!['r1_results', 'r1_clearing'].includes(s.phase)) throw new GameError('Reveal Round 1 first.');
        s.phase = 'workshop';
        break;
      case 'showDebrief':
        if (!['r2_results', 'r2_clearing'].includes(s.phase)) throw new GameError('Finish Round 2 first.');
        s.phase = 'debrief';
        break;
      case 'loadDemo': {
        if (s.phase !== 'registration') throw new GameError('Demo players can only be added during registration.');
        const count = Math.max(1, Math.min(Number(action.count) || 0, MAX_HUMANS - s.players.length));
        if (s.players.length >= MAX_HUMANS) throw new GameError('The market is already full.');
        const wasOpen = s.registrationOpen;
        s.registrationOpen = true;
        for (let i = 0; i < count; i++) this.join(`Demo participant ${s.players.length + 1}`, s.code, true);
        s.registrationOpen = wasOpen;
        break;
      }
      case 'removePlayer':
        if (s.phase !== 'registration') throw new GameError('Participants can only be removed before Round 1.');
        s.players = s.players.filter((p) => p.id !== action.playerId);
        break;
      case 'setAutoReveal':
        s.autoReveal = !!action.value;
        break;
      case 'setDuration': {
        const secs = Math.round(Number(action.seconds));
        if (!(secs >= 15 && secs <= 900)) throw new GameError('Duration must be 15 to 900 seconds.');
        if (action.round === 1) s.r1Seconds = secs;
        else s.r2Seconds = secs;
        break;
      }
      default:
        throw new GameError('Unknown action.');
    }
    this.changed();
  }

  // --------------------------------------------------------------------------
  //  Views
  // --------------------------------------------------------------------------
  private publicMarket(round: RoundNo): PublicMarketInfo | undefined {
    const r = this.state.rounds[round];
    if (!r || !isRevealed(this.state.phase, round)) return undefined;
    return {
      round,
      avgPrice: r.avgPrice,
      totalDemand: r.totalDemand,
      pctCut: r.moves.pctCut,
      pctHold: r.moves.pctHold,
      pctRaise: r.moves.pctRaise,
    };
  }

  private myResult(round: RoundNo, playerId: string): MyRoundResult | undefined {
    const r = this.state.rounds[round];
    if (!r || !isRevealed(this.state.phase, round)) return undefined;
    const me = r.results.find((x) => x.id === playerId);
    if (!me) return undefined;
    return {
      round,
      price: me.price,
      defaulted: me.defaulted,
      marketShare: me.marketShare,
      units: me.units,
      revenue: me.revenue,
      variableCostTotal: me.variableCostTotal,
      fixedCost: me.fixedCost,
      profit: me.profit,
      profitRank: me.profitRank,
      shareRank: me.shareRank,
      totalCompetitors: r.totalCompetitors,
      avgPrice: r.avgPrice,
      totalDemand: r.totalDemand,
    };
  }

  playerView(player: StoredPlayer): PlayerView {
    const s = this.state;
    const decisions: PlayerView['me']['decisions'] = {};
    const results: PlayerView['me']['results'] = {};
    const market: PlayerView['market'] = {};
    for (const r of [1, 2] as RoundNo[]) {
      const d = s.decisions[r][player.id];
      if (d !== undefined) decisions[r] = d;
      const res = this.myResult(r, player.id);
      if (res) results[r] = res;
      const m = this.publicMarket(r);
      if (m) market[r] = m;
    }
    return {
      kind: 'player',
      serverNow: this.now(),
      session: { code: s.code, phase: s.phase, registrationOpen: s.registrationOpen, timer: s.timer },
      me: {
        id: player.id,
        name: player.name,
        codename: player.codename,
        profile: PROFILE_BY_ID[player.profileId],
        decisions,
        results,
      },
      market,
    };
  }

  hostView(): HostView {
    const s = this.state;
    const round = currentRound(s.phase);
    const aiCount = s.ai.length || Math.max(0, MIN_COMPETITORS - s.players.length);
    return {
      kind: 'host',
      serverNow: this.now(),
      session: {
        sessionId: s.sessionId,
        code: s.code,
        phase: s.phase,
        registrationOpen: s.registrationOpen,
        timer: s.timer,
        autoReveal: s.autoReveal,
        r1Seconds: s.r1Seconds,
        r2Seconds: s.r2Seconds,
        createdAt: s.createdAt,
      },
      counts: {
        humans: s.players.length,
        maxHumans: MAX_HUMANS,
        connected: s.players.filter((p) => this.connected.has(p.id)).length,
        totalCompetitors: s.players.length + aiCount,
        aiCompetitors: aiCount,
        submissions: round ? Object.keys(s.decisions[round]).length : 0,
        expectedSubmissions: s.players.length,
      },
      players: s.players.map((p) => {
        const prof = PROFILE_BY_ID[p.profileId];
        return {
          id: p.id,
          name: p.name,
          codename: p.codename,
          archetype: prof.archetype,
          company: prof.company,
          isDemo: p.isDemo,
          connected: this.connected.has(p.id),
          token: p.isDemo ? p.token : undefined,
          decisions: { ...(s.decisions['1'][p.id] ? { 1: s.decisions['1'][p.id] } : {}), ...(s.decisions['2'][p.id] ? { 2: s.decisions['2'][p.id] } : {}) },
        };
      }),
      ai: s.ai.map((a) => ({
        id: a.id,
        name: a.name,
        archetype: a.archetype,
        economics: { customerValue: a.customerValue, elasticity: a.elasticity, variableCost: a.variableCost, fixedCost: a.fixedCost },
        // Only show AI decisions once the round has cleared.
        decisions: {
          ...(s.rounds['1'] ? { 1: s.aiDecisions['1'][a.id] } : {}),
          ...(s.rounds['2'] ? { 2: s.aiDecisions['2'][a.id] } : {}),
        },
      })),
      rounds: { ...(s.rounds['1'] ? { 1: s.rounds['1'] } : {}), ...(s.rounds['2'] ? { 2: s.rounds['2'] } : {}) },
      debrief: s.rounds['1'] ? this.debrief() : null,
    };
  }

  debrief(): Debrief {
    const s = this.state;
    const humanIds = new Set(s.players.map((p) => p.id));
    const rounds: Debrief['rounds'] = {};
    for (const r of [1, 2] as RoundNo[]) {
      const rec = s.rounds[r];
      if (!rec) continue;
      const n = rec.results.length;
      const humanRes = rec.results.filter((x) => humanIds.has(x.id));
      const hist = Object.fromEntries(PRICE_OPTIONS.map((p) => [p, 0])) as Record<Price, number>;
      rec.results.forEach((x) => hist[x.price]++);
      rounds[r] = {
        avgPrice: rec.avgPrice,
        avgProfit: rec.totalProfit / n,
        avgRevenue: rec.totalRevenue / n,
        avgShare: humanRes.length ? humanRes.reduce((a, x) => a + x.marketShare, 0) / humanRes.length : 1 / n,
        moves: rec.moves,
        totalDemand: rec.totalDemand,
        totalRevenue: rec.totalRevenue,
        totalProfit: rec.totalProfit,
        priceHistogram: hist,
      };
    }

    const scenario = (key: string, label: string, entries: MarketEntry[]) => {
      const o = clearMarket(entries);
      return {
        key,
        label,
        avgPrice: o.avgPrice,
        totalDemand: o.totalDemand,
        totalRevenue: o.totalRevenue,
        totalProfit: o.totalProfit,
        avgProfit: o.totalProfit / o.totalCompetitors,
      };
    };
    const counterfactuals = [
      ...(s.rounds['1'] ? [scenario('actual1', 'Actual market · Round 1', this.entriesFor(1))] : []),
      ...(s.rounds['2'] ? [scenario('actual2', 'Actual market · Round 2', this.entriesFor(2))] : []),
      ...COUNTERFACTUALS.map((c) => scenario(c.key, c.label, this.entriesFor(1, () => c.price as Price))),
    ];

    const r1 = s.rounds['1'];
    const r2 = s.rounds['2'];
    const hr = (rec: RoundRecord | undefined) => (rec ? rec.results.filter((x) => humanIds.has(x.id)) : []);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const h1 = hr(r1);
    const h2 = hr(r2);
    const both = s.players.filter((p) => h1.some((x) => x.id === p.id) && h2.some((x) => x.id === p.id));
    const change = both.map((p) => h2.find((x) => x.id === p.id)!.price - h1.find((x) => x.id === p.id)!.price);
    const pct = (k: number) => (both.length ? k / both.length : null);

    const byId = (rec: RoundRecord | undefined, id: string): CompetitorResult | undefined => rec?.results.find((x) => x.id === id);
    const leaderboard = [
      ...s.players.map((p) => ({ id: p.id, label: `${p.codename} · ${p.name}`, kind: 'human' as const, archetype: PROFILE_BY_ID[p.profileId].archetype })),
      ...s.ai.map((a) => ({ id: a.id, label: `${a.name} (AI)`, kind: 'ai' as const, archetype: a.archetype })),
    ].map((row) => ({
      ...row,
      r1Profit: byId(r1, row.id)?.profit ?? null,
      r2Profit: byId(r2, row.id)?.profit ?? null,
      r1Price: byId(r1, row.id)?.price ?? null,
      r2Price: byId(r2, row.id)?.price ?? null,
    }));

    return {
      rounds,
      counterfactuals,
      learning: {
        humans: s.players.length,
        avgProfitR1: avg(h1.map((x) => x.profit)),
        avgProfitR2: avg(h2.map((x) => x.profit)),
        avgPriceR1: avg(h1.map((x) => x.price)),
        avgPriceR2: avg(h2.map((x) => x.price)),
        pctChanged: pct(change.filter((c) => c !== 0).length),
        pctUp: pct(change.filter((c) => c > 0).length),
        pctDown: pct(change.filter((c) => c < 0).length),
      },
      leaderboard,
    };
  }

  // --------------------------------------------------------------------------
  //  CSV export
  // --------------------------------------------------------------------------
  playersCsv(): string {
    const s = this.state;
    const cols = [
      'player_id', 'name', 'codename', 'company_archetype', 'company', 'is_demo', 'customer_value', 'elasticity', 'variable_cost', 'fixed_cost',
      'round1_price', 'round1_defaulted', 'round1_market_share', 'round1_units', 'round1_revenue', 'round1_profit',
      'round2_price', 'round2_defaulted', 'round2_market_share', 'round2_units', 'round2_revenue', 'round2_profit',
      'price_change', 'market_share_change', 'revenue_change', 'profit_change',
    ];
    const rows = s.players.map((p) => {
      const prof = PROFILE_BY_ID[p.profileId];
      const a = s.rounds['1']?.results.find((x) => x.id === p.id);
      const b = s.rounds['2']?.results.find((x) => x.id === p.id);
      const d = (f: (x: CompetitorResult) => number) => (a && b ? f(b) - f(a) : '');
      return [
        p.id, p.name, p.codename, prof.archetype, prof.company, p.isDemo, prof.customerValue, prof.elasticity, prof.variableCost, prof.fixedCost,
        a?.price ?? '', a ? a.defaulted : '', a ? a.marketShare.toFixed(5) : '', a?.units ?? '', a ? Math.round(a.revenue) : '', a ? Math.round(a.profit) : '',
        b?.price ?? '', b ? b.defaulted : '', b ? b.marketShare.toFixed(5) : '', b?.units ?? '', b ? Math.round(b.revenue) : '', b ? Math.round(b.profit) : '',
        d((x) => x.price), a && b ? (b.marketShare - a.marketShare).toFixed(5) : '', a && b ? Math.round(b.revenue - a.revenue) : '', a && b ? Math.round(b.profit - a.profit) : '',
      ];
    });
    return toCsv([cols, ...rows]);
  }

  marketCsv(): string {
    const s = this.state;
    const lines: (string | number)[][] = [
      ['section', 'metric', 'round1', 'round2'],
    ];
    const r1 = s.rounds['1'];
    const r2 = s.rounds['2'];
    const m = (label: string, f: (r: RoundRecord) => number | string) =>
      lines.push(['market', label, r1 ? f(r1) : '', r2 ? f(r2) : '']);
    m('total_competitors', (r) => r.totalCompetitors);
    m('human_competitors', (r) => r.humans);
    m('average_price', (r) => r.avgPrice.toFixed(2));
    m('demand_factor', (r) => r.demandFactor.toFixed(4));
    m('total_market_demand', (r) => r.totalDemand.toFixed(1));
    m('total_market_revenue', (r) => Math.round(r.totalRevenue));
    m('total_market_profit', (r) => Math.round(r.totalProfit));
    m('average_profit', (r) => Math.round(r.totalProfit / r.totalCompetitors));
    m('count_cut', (r) => r.moves.cut);
    m('count_hold', (r) => r.moves.hold);
    m('count_raise', (r) => r.moves.raise);
    if (r1) {
      lines.push([]);
      lines.push(['counterfactual', 'scenario', 'total_demand', 'total_revenue', 'total_profit', 'avg_profit']);
      for (const c of this.debrief().counterfactuals) {
        lines.push(['counterfactual', c.label, c.totalDemand.toFixed(1), Math.round(c.totalRevenue), Math.round(c.totalProfit), Math.round(c.avgProfit)]);
      }
      lines.push([]);
      lines.push(['competitor', 'id', 'kind', 'archetype', 'round1_price', 'round1_share', 'round1_profit', 'round2_price', 'round2_share', 'round2_profit']);
      const all = [
        ...s.players.map((p) => ({ id: p.id, kind: 'human', arch: PROFILE_BY_ID[p.profileId].archetype })),
        ...s.ai.map((a) => ({ id: a.id, kind: 'ai', arch: a.archetype })),
      ];
      for (const c of all) {
        const a = r1.results.find((x) => x.id === c.id);
        const b = r2?.results.find((x) => x.id === c.id);
        lines.push(['competitor', c.id, c.kind, c.arch, a?.price ?? '', a ? a.marketShare.toFixed(5) : '', a ? Math.round(a.profit) : '', b?.price ?? '', b ? b.marketShare.toFixed(5) : '', b ? Math.round(b.profit) : '']);
      }
    }
    return toCsv(lines);
  }
}

function toCsv(rows: (string | number | boolean)[][]): string {
  const esc = (v: string | number | boolean) => {
    const str = String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export { REFERENCE_PRICE };
