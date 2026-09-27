import { randomBytes, randomUUID } from 'node:crypto';
import {
  PRICE_OPTIONS,
  type BestResponseTable,
  type CompetitorResult,
  type CompetitorRow,
  type Debrief,
  type FlowRow,
  type HostAction,
  type HostView,
  type LeaderRow,
  type Letter,
  type MarketRecord,
  type MyRoundResult,
  type Phase,
  type PlayerView,
  type Price,
  type PublicMarketInfo,
  type QuizOption,
  type Round2Desk,
  type RoundNo,
  type RoundRecord,
  type ScenarioOutcome,
  type TimerState,
} from '../../shared/types';
import { aiRound1Decision, aiRound2Decision, demoGuess, demoRound1Decision, demoRound2Decision, type Round2Context } from './sim/ai';
import { COMPANIES, COMPANY_BY_LETTER } from './sim/companies';
import {
  bestResponse,
  clearMarket,
  flowsFor,
  isGridPrice,
  moveStats,
  paidProfit,
  reactionPer100,
  rngFor,
  shuffle,
  similarity,
  snap,
  type MarketEntry,
} from './sim/market';
import {
  DEFAULT_PRICE_R1,
  MARKET_SIZE,
  MAX_HUMANS,
  REFERENCE_PRICE,
  ROUND1_SECONDS,
  ROUND2_SECONDS,
  SMB_CLUSTER,
} from './sim/params';
import { PROFILES, PROFILE_BY_ID, codenameFor } from './sim/profiles';

// ============================================================================
//  Game: the authoritative state machine. No sockets in here, so it can be
//  driven directly by tests with a fake clock.
//
//  Players are dealt dossiers on join. At Round 1 start they are placed into
//  parallel markets of ten (one company per archetype); AI fills the gaps.
// ============================================================================

export interface StoredPlayer {
  id: string;
  token: string;
  name: string;
  codename: string;
  profileId: string;
  isDemo: boolean;
  joinedAt: number;
  marketIndex: number | null;
}

export interface StoredAi {
  id: string; // M1-AI-G
  name: string;
  letter: Letter;
  marketIndex: number;
}

type DemoEvent = { playerId: string; round: RoundNo; at: number } & ({ kind: 'price'; price: Price } | { kind: 'guess'; competitorId: string });

export interface SessionState {
  version: 2;
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
  marketCount: number;
  decisions: Record<'1' | '2', Record<string, Price>>;
  aiDecisions: Record<'1' | '2', Record<string, Price>>;
  /** playerId → competitor id they named as their Round 1 primary competitor */
  guesses: Record<string, string>;
  rounds: Partial<Record<'1' | '2', RoundRecord>>;
  demoSchedule: DemoEvent[];
}

export interface Store {
  load(): unknown;
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
    version: 2,
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
    marketCount: 0,
    decisions: { '1': {}, '2': {} },
    aiDecisions: { '1': {}, '2': {} },
    guesses: {},
    rounds: {},
    demoSchedule: [],
  };
}

const DECISION_PHASE: Record<RoundNo, Phase> = { 1: 'r1_decision', 2: 'r2_decision' };
const CLEARING_PHASE: Record<RoundNo, Phase> = { 1: 'r1_clearing', 2: 'r2_clearing' };
const RESULTS_PHASE: Record<RoundNo, Phase> = { 1: 'r1_results', 2: 'r2_results' };
const ROUND2_PHASES: Phase[] = ['r2_decision', 'r2_clearing', 'r2_results', 'debrief'];

export function isRevealed(phase: Phase, round: RoundNo): boolean {
  if (round === 1) return ['r1_results', 'workshop', ...ROUND2_PHASES].includes(phase);
  return ['r2_results', 'debrief'].includes(phase);
}

export function currentRound(phase: Phase): RoundNo | null {
  if (phase === 'r1_decision') return 1;
  if (phase === 'r2_decision') return 2;
  return null;
}

const letterOf = (p: StoredPlayer) => PROFILE_BY_ID[p.profileId].letter;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Market entries rebuilt from a cleared market record. */
function entriesFromRecord(m: MarketRecord): MarketEntry[] {
  return m.results.map((r) => ({ id: r.id, kind: r.kind, letter: r.letter, company: r.company, price: r.price, defaulted: r.defaulted }));
}

export interface GameOptions {
  now?: () => number;
  store?: Store;
  seed?: string;
  /** Demo bots act between these fractions of the round timer. */
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
    this.demoWindow = opts.demoWindow ?? [0.04, 0.3];
    const loaded = this.store?.load() as SessionState | null | undefined;
    // Anything saved by an older version starts a fresh session instead of crashing.
    this.state = loaded && loaded.version === 2 ? loaded : freshSession(this.now(), opts.seed);
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

  playerByToken(token: unknown): StoredPlayer | undefined {
    if (typeof token !== 'string' || !token) return undefined;
    return this.state.players.find((p) => p.token === token);
  }

  join(rawName: unknown, rawCode: unknown, isDemo = false): StoredPlayer {
    const s = this.state;
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (!isDemo && code !== s.code) throw new GameError('That session code is not active. Check the code on the screen.');
    if (s.phase !== 'registration' || !s.registrationOpen) throw new GameError('Registration closed.');
    if (s.players.length >= MAX_HUMANS) throw new GameError(`The room is full (${MAX_HUMANS} participants).`);
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
      marketIndex: null,
    };
    s.players.push(player);
    this.changed();
    return player;
  }

  /** Balanced random assignment: each block of 10 joiners gets all 10 dossiers, shuffled. */
  private profileForIndex(index: number): string {
    const block = Math.floor(index / PROFILES.length);
    const order = shuffle(PROFILES.map((_, i) => i), rngFor(this.state.seed, 'deck', block));
    return PROFILES[order[index % PROFILES.length]].id;
  }

  /** Markets needed for the current registrations (max humans on any one archetype). */
  private projectedMarkets(): number {
    const counts: Record<string, number> = {};
    for (const p of this.state.players) counts[letterOf(p)] = (counts[letterOf(p)] ?? 0) + 1;
    return Math.max(1, ...Object.values(counts));
  }

  /** Market m takes the m-th human of each archetype (join order); AI fills the rest. */
  private assignMarkets() {
    const s = this.state;
    const byLetter: Record<string, StoredPlayer[]> = {};
    for (const p of s.players) (byLetter[letterOf(p)] ??= []).push(p);
    s.marketCount = this.projectedMarkets();
    for (const list of Object.values(byLetter)) list.forEach((p, m) => (p.marketIndex = m));
    s.ai = [];
    for (let m = 0; m < s.marketCount; m++) {
      for (const c of COMPANIES) {
        if (!s.players.some((p) => p.marketIndex === m && letterOf(p) === c.letter)) {
          s.ai.push({ id: `M${m + 1}-AI-${c.letter}`, name: c.aiName, letter: c.letter, marketIndex: m });
        }
      }
    }
  }

  submit(token: unknown, rawPrice: unknown): { price: Price; duplicate: boolean } {
    const player = this.playerByToken(token);
    if (!player) throw new GameError('Unknown player. Please rejoin.');
    const round = currentRound(this.state.phase);
    if (!round) throw new GameError('Decisions are not open right now.');
    const price = Number(rawPrice);
    if (!isGridPrice(price)) throw new GameError('Invalid price.');
    const existing = this.state.decisions[round][player.id];
    if (existing !== undefined) return { price: existing, duplicate: true };
    if (round === 2 && this.state.guesses[player.id] === undefined) {
      throw new GameError('Answer the Round 1 question first.');
    }
    this.state.decisions[round][player.id] = price;
    this.state.demoSchedule = this.state.demoSchedule.filter((d) => !(d.playerId === player.id && d.kind === 'price'));
    if (this.allSubmitted(round)) this.resolve(round);
    else this.changed();
    return { price, duplicate: false };
  }

  /** Round 2: name your Round 1 primary competitor. Once only. */
  guess(token: unknown, rawId: unknown): { correct: boolean } {
    const player = this.playerByToken(token);
    if (!player) throw new GameError('Unknown player. Please rejoin.');
    if (this.state.phase !== 'r2_decision') throw new GameError('The question is only open during Round 2.');
    if (this.state.guesses[player.id] !== undefined) throw new GameError('You have already answered.');
    const id = String(rawId ?? '');
    const options = this.quizOptions(player);
    if (!options.some((o) => o.id === id)) throw new GameError('Pick one of the listed competitors.');
    this.state.guesses[player.id] = id;
    this.state.demoSchedule = this.state.demoSchedule.filter((d) => !(d.playerId === player.id && d.kind === 'guess'));
    this.changed();
    return { correct: id === this.r1Result(player)?.primaryCompetitorId };
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
    if (!s.timer?.paused) {
      const due = s.demoSchedule.filter((d) => d.round === round && d.at <= now).sort((a, b) => a.at - b.at);
      for (const d of due) {
        if (currentRound(this.state.phase) !== round) return;
        const p = s.players.find((x) => x.id === d.playerId);
        s.demoSchedule = s.demoSchedule.filter((x) => x !== d);
        if (!p) continue;
        try {
          if (d.kind === 'guess' && s.guesses[p.id] === undefined) this.guess(p.token, d.competitorId);
          if (d.kind === 'price' && s.decisions[round][p.id] === undefined) this.submit(p.token, d.price);
        } catch {
          /* a demo action that is no longer valid is simply dropped */
        }
      }
      if (currentRound(this.state.phase) !== round) return;
    }
    if (s.timer && !s.timer.paused && s.timer.endsAt !== null && now >= s.timer.endsAt) {
      this.resolve(round);
    }
  }

  // --------------------------------------------------------------------------
  //  Rounds
  // --------------------------------------------------------------------------
  private startRound(round: RoundNo) {
    const s = this.state;
    if (round === 1) {
      if (s.phase !== 'registration') throw new GameError('Round 1 can only start from registration.');
      if (s.players.length === 0) throw new GameError('At least one participant must join first.');
      s.registrationOpen = false;
      this.assignMarkets();
      s.aiDecisions['1'] = Object.fromEntries(s.ai.map((a) => [a.id, aiRound1Decision(s.seed, a.id, a.letter)]));
    } else {
      if (!['r1_results', 'workshop', 'r1_clearing'].includes(s.phase)) {
        throw new GameError('Round 2 can start after Round 1 has been revealed.');
      }
      if (!s.rounds['1']) throw new GameError('Round 1 has not been resolved.');
      s.guesses = {};
      s.aiDecisions['2'] = Object.fromEntries(
        s.ai.map((a) => [a.id, aiRound2Decision(s.seed, a.id, a.letter, this.round2Context(a.id, a.marketIndex))]),
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

  /** What a company knows going into Round 2, from its Round 1 market. */
  private round2Context(id: string, marketIndex: number): Round2Context {
    const m = this.state.rounds['1']!.markets[marketIndex];
    const me = m.results.find((r) => r.id === id)!;
    const pc = m.results.find((r) => r.id === me.primaryCompetitorId);
    return { r1Price: me.price, bestResponse: me.bestPrice, pcPrice: pc?.price ?? me.price, captured: me.captured };
  }

  private scheduleDemo(round: RoundNo, durationMs: number) {
    const s = this.state;
    const [lo, hi] = this.demoWindow;
    const events: DemoEvent[] = [];
    for (const p of s.players.filter((x) => x.isDemo)) {
      const r = rngFor(s.seed, 'demo-delay', p.id, round)();
      const at = this.now() + durationMs * (lo + (hi - lo) * r);
      if (round === 1) {
        events.push({ playerId: p.id, round, at, kind: 'price', price: demoRound1Decision(s.seed, p.id, letterOf(p)) });
      } else {
        const options = this.quizOptions(p).map((o) => o.id);
        const correct = this.r1Result(p)!.primaryCompetitorId;
        events.push({ playerId: p.id, round, at: at - durationMs * lo * 0.5, kind: 'guess', competitorId: demoGuess(s.seed, p.id, options, correct) });
        events.push({ playerId: p.id, round, at, kind: 'price', price: demoRound2Decision(s.seed, p.id, this.round2Context(p.id, p.marketIndex!)) });
      }
    }
    s.demoSchedule = events;
  }

  private defaultPrice(round: RoundNo, id: string): Price {
    if (round === 1) return DEFAULT_PRICE_R1;
    const r1 = this.state.rounds['1']?.markets.flatMap((m) => m.results).find((r) => r.id === id);
    return r1?.price ?? DEFAULT_PRICE_R1;
  }

  /** The ten companies of one market, with the prices of a round (or an override). */
  entriesFor(round: RoundNo, marketIndex: number, override?: (letter: Letter) => number): MarketEntry[] {
    const s = this.state;
    const human: MarketEntry[] = s.players
      .filter((p) => p.marketIndex === marketIndex)
      .map((p) => {
        const decided = s.decisions[round][p.id];
        return {
          id: p.id,
          kind: 'human',
          letter: letterOf(p),
          company: PROFILE_BY_ID[p.profileId].company,
          price: decided ?? this.defaultPrice(round, p.id),
          defaulted: decided === undefined,
        };
      });
    const ai: MarketEntry[] = s.ai
      .filter((a) => a.marketIndex === marketIndex)
      .map((a) => ({ id: a.id, kind: 'ai', letter: a.letter, company: a.name, price: s.aiDecisions[round][a.id] ?? this.defaultPrice(round, a.id) }));
    const all = [...human, ...ai].sort((a, b) => a.letter.localeCompare(b.letter));
    return override ? all.map((e) => ({ ...e, price: override(e.letter), defaulted: false })) : all;
  }

  private resolve(round: RoundNo) {
    const s = this.state;
    if (s.phase !== DECISION_PHASE[round]) return;
    const markets: MarketRecord[] = [];
    for (let m = 0; m < s.marketCount; m++) {
      const o = clearMarket(this.entriesFor(round, m), m);
      markets.push({ index: m, humans: s.players.filter((p) => p.marketIndex === m).length, ...o });
    }
    const all = markets.flatMap((m) => m.results);
    s.rounds[round] = {
      round,
      resolvedAt: this.now(),
      totalCompetitors: all.length,
      humans: s.players.length,
      avgPrice: all.reduce((a, r) => a + r.price, 0) / all.length,
      totalUnits: markets.reduce((a, m) => a + m.totalUnits, 0),
      totalRevenue: markets.reduce((a, m) => a + m.totalRevenue, 0),
      totalProfit: markets.reduce((a, m) => a + m.totalProfit, 0),
      moves: moveStats(all.map((r) => r.price)),
      markets,
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
        {
          const now = this.now();
          s.timer = { ...s.timer, remainingMs: this.remaining(s.timer), endsAt: null, paused: true };
          s.demoSchedule = s.demoSchedule.map((d) => ({ ...d, at: d.at - now })); // offsets while paused
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
        const durationMs = Math.max(s.timer.durationMs, remainingMs);
        s.timer = s.timer.paused
          ? { ...s.timer, remainingMs, durationMs }
          : { ...s.timer, endsAt: this.now() + remainingMs, remainingMs, durationMs };
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
        if (s.players.length >= MAX_HUMANS) throw new GameError('The room is already full.');
        const count = Math.max(1, Math.min(Number(action.count) || 0, MAX_HUMANS - s.players.length));
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
        if (!(secs >= 15 && secs <= 1200)) throw new GameError('Duration must be 15 to 1,200 seconds.');
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
  //  Player views
  // --------------------------------------------------------------------------
  private marketRecord(round: RoundNo, marketIndex: number | null): MarketRecord | undefined {
    if (marketIndex === null) return undefined;
    return this.state.rounds[round]?.markets[marketIndex];
  }

  private r1Result(p: StoredPlayer): CompetitorResult | undefined {
    return this.marketRecord(1, p.marketIndex)?.results.find((r) => r.id === p.id);
  }

  private competitorRows(m: MarketRecord, me: CompetitorResult): CompetitorRow[] {
    return m.results
      .filter((r) => r.id !== me.id)
      .map((r) => ({
        id: r.id,
        company: r.company,
        segment: COMPANY_BY_LETTER[r.letter].segment,
        letter: r.letter,
        similarity: similarity(me.letter, r.letter),
        price: r.price,
      }))
      .sort((a, b) => b.similarity - a.similarity || a.letter.localeCompare(b.letter));
  }

  private flowRows(m: MarketRecord, me: CompetitorResult): FlowRow[] {
    const entries = entriesFromRecord(m);
    const idx = entries.findIndex((e) => e.id === me.id);
    return flowsFor(entries, idx)
      .map((f) => ({ id: f.id, company: f.company, similarity: f.similarity, customers: Math.round(f.flow) }))
      .sort((a, b) => Math.abs(b.customers) - Math.abs(a.customers) || b.similarity - a.similarity);
  }

  private myResult(round: RoundNo, p: StoredPlayer): MyRoundResult | undefined {
    if (!isRevealed(this.state.phase, round)) return undefined;
    const m = this.marketRecord(round, p.marketIndex);
    const me = m?.results.find((r) => r.id === p.id);
    if (!m || !me) return undefined;
    const prof = PROFILE_BY_ID[p.profileId];
    const flowsAllowed = round === 2 || this.state.guesses[p.id] !== undefined || isRevealed(this.state.phase, 2);
    return {
      round,
      price: me.price,
      defaulted: me.defaulted,
      units: me.units,
      revenue: me.revenue,
      variableCostTotal: me.variableCostTotal,
      fixedCost: me.fixedCost,
      profit: me.profit,
      share: me.share,
      startCustomers: prof.startCustomers,
      startShare: me.startShare,
      shareChangePp: me.shareChangePp,
      statusQuoProfit: me.statusQuoProfit,
      profitRank: me.profitRank,
      marketSize: m.results.length,
      dossierRightPrice: prof.rightPrice,
      bestGivenCompetitors: { price: me.bestPrice, profit: me.bestProfit },
      competitors: this.competitorRows(m, me),
      ...(flowsAllowed ? { flows: this.flowRows(m, me), primaryCompetitorId: me.primaryCompetitorId } : {}),
    };
  }

  /** Four most similar competitors, always including the true primary competitor; seeded order. */
  quizOptions(p: StoredPlayer): QuizOption[] {
    const m = this.marketRecord(1, p.marketIndex);
    const me = m?.results.find((r) => r.id === p.id);
    if (!m || !me) return [];
    const rows = this.competitorRows(m, me);
    const top = rows.slice(0, 4);
    if (!top.some((r) => r.id === me.primaryCompetitorId)) {
      top[3] = rows.find((r) => r.id === me.primaryCompetitorId)!;
    }
    return shuffle(top, rngFor(this.state.seed, 'quiz', p.id)).map((r) => ({
      id: r.id,
      company: r.company,
      segment: r.segment,
      similarity: r.similarity,
      r1Price: r.price,
    }));
  }

  /** Best response vs the primary competitor, everyone else held at Round 1 prices. */
  private bestResponseTable(m: MarketRecord, me: CompetitorResult): BestResponseTable {
    const entries = entriesFromRecord(m);
    const myIdx = entries.findIndex((e) => e.id === me.id);
    const rivalIdx = entries.findIndex((e) => e.id === me.primaryCompetitorId);
    const rival = entries[rivalIdx];
    const rivalPrices = [...new Set([-200, -100, 0, 100, 200].map((d) => snap(rival.price + d)))];
    return {
      rivalId: rival.id,
      rivalCompany: rival.company,
      rivalR1Price: rival.price,
      reactionPer100: reactionPer100(me.letter, rival.letter),
      rows: rivalPrices.map((rp) => {
        const e = entries.map((x, i) => (i === rivalIdx ? { ...x, price: rp } : x));
        const bestPrice = bestResponse(e, myIdx);
        return { rivalPrice: rp, bestPrice, profit: paidProfit(e, myIdx, bestPrice) };
      }),
    };
  }

  private desk(p: StoredPlayer): Round2Desk | null {
    if (!ROUND2_PHASES.includes(this.state.phase)) return null;
    const m = this.marketRecord(1, p.marketIndex);
    const me = m?.results.find((r) => r.id === p.id);
    if (!m || !me) return null;
    const guess = this.state.guesses[p.id] ?? null;
    const showAnswer = guess !== null || isRevealed(this.state.phase, 2);
    return {
      options: this.quizOptions(p),
      guess,
      reveal: showAnswer
        ? {
            correct: guess === me.primaryCompetitorId,
            primaryId: me.primaryCompetitorId,
            primaryCompany: m.results.find((r) => r.id === me.primaryCompetitorId)?.company ?? '',
            flows: this.flowRows(m, me),
            table: this.bestResponseTable(m, me),
          }
        : null,
    };
  }

  private publicMarket(round: RoundNo, marketIndex: number | null): PublicMarketInfo | undefined {
    const m = this.marketRecord(round, marketIndex);
    if (!m || !isRevealed(this.state.phase, round)) return undefined;
    return {
      round,
      avgPrice: m.avgPrice,
      totalUnits: m.totalUnits,
      pctCut: m.moves.pctCut,
      pctHold: m.moves.pctHold,
      pctRaise: m.moves.pctRaise,
    };
  }

  playerView(player: StoredPlayer): PlayerView {
    const s = this.state;
    const prof = PROFILE_BY_ID[player.profileId];
    const decisions: PlayerView['me']['decisions'] = {};
    const results: PlayerView['me']['results'] = {};
    const market: PlayerView['market'] = {};
    for (const r of [1, 2] as RoundNo[]) {
      const d = s.decisions[r][player.id];
      if (d !== undefined) decisions[r] = d;
      const res = this.myResult(r, player);
      if (res) results[r] = res;
      const pm = this.publicMarket(r, player.marketIndex);
      if (pm) market[r] = pm;
    }
    const q0Total = COMPANIES.reduce((a, c) => a + c.startCustomers, 0);
    return {
      kind: 'player',
      serverNow: this.now(),
      session: { code: s.code, phase: s.phase, registrationOpen: s.registrationOpen, timer: s.timer },
      me: {
        id: player.id,
        name: player.name,
        codename: player.codename,
        profile: prof,
        marketIndex: player.marketIndex,
        start: s.phase === 'registration' ? null : { customers: prof.startCustomers, share: prof.startCustomers / q0Total },
        decisions,
        results,
      },
      market,
      desk: this.desk(player),
    };
  }

  // --------------------------------------------------------------------------
  //  Host views
  // --------------------------------------------------------------------------
  hostView(): HostView {
    const s = this.state;
    const round = currentRound(s.phase);
    const markets = s.marketCount || this.projectedMarkets();
    const aiCount = s.marketCount ? s.ai.length : markets * MARKET_SIZE - s.players.length;
    const r1All = s.rounds['1']?.markets.flatMap((m) => m.results) ?? [];
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
        markets,
        totalCompetitors: s.players.length + aiCount,
        aiCompetitors: aiCount,
        submissions: round ? Object.keys(s.decisions[round]).length : 0,
        expectedSubmissions: s.players.length,
        guesses: Object.keys(s.guesses).length,
      },
      players: s.players.map((p) => {
        const prof = PROFILE_BY_ID[p.profileId];
        const g = s.guesses[p.id];
        const r1 = r1All.find((r) => r.id === p.id);
        return {
          id: p.id,
          name: p.name,
          codename: p.codename,
          letter: prof.letter,
          archetype: prof.archetype,
          company: prof.company,
          isDemo: p.isDemo,
          connected: this.connected.has(p.id),
          marketIndex: p.marketIndex,
          token: p.isDemo ? p.token : undefined,
          decisions: {
            ...(s.decisions['1'][p.id] !== undefined ? { 1: s.decisions['1'][p.id] } : {}),
            ...(s.decisions['2'][p.id] !== undefined ? { 2: s.decisions['2'][p.id] } : {}),
          },
          guess: g ? { company: r1All.find((r) => r.id === g)?.company ?? g, correct: g === r1?.primaryCompetitorId } : null,
        };
      }),
      ai: s.ai.map((a) => {
        const c = COMPANY_BY_LETTER[a.letter];
        return {
          id: a.id,
          name: a.name,
          letter: a.letter,
          archetype: c.archetype,
          personality: c.personality,
          marketIndex: a.marketIndex,
          vc: c.vc,
          fc: c.fc,
          rightPrice: c.rightPrice,
          // Only show AI decisions once the round has cleared.
          decisions: {
            ...(s.rounds['1'] ? { 1: s.aiDecisions['1'][a.id] } : {}),
            ...(s.rounds['2'] ? { 2: s.aiDecisions['2'][a.id] } : {}),
          },
        };
      }),
      rounds: { ...(s.rounds['1'] ? { 1: s.rounds['1'] } : {}), ...(s.rounds['2'] ? { 2: s.rounds['2'] } : {}) },
      debrief: s.rounds['1'] ? this.debrief() : null,
    };
  }

  /** Sum a whole-room scenario across all markets. */
  private scenario(key: string, label: string, price: (l: Letter) => number): ScenarioOutcome {
    let n = 0, units = 0, revenue = 0, profit = 0, priceSum = 0;
    for (let m = 0; m < this.state.marketCount; m++) {
      const o = clearMarket(this.entriesFor(1, m, price), m);
      n += o.results.length;
      units += o.totalUnits;
      revenue += o.totalRevenue;
      profit += o.totalProfit;
      priceSum += o.results.reduce((a, r) => a + r.price, 0);
    }
    return { key, label, avgPrice: priceSum / (n || 1), totalUnits: units, totalRevenue: revenue, totalProfit: profit, avgProfit: profit / (n || 1) };
  }

  private actualScenario(key: string, label: string, rec: RoundRecord): ScenarioOutcome {
    return {
      key,
      label,
      avgPrice: rec.avgPrice,
      totalUnits: rec.totalUnits,
      totalRevenue: rec.totalRevenue,
      totalProfit: rec.totalProfit,
      avgProfit: rec.totalProfit / rec.totalCompetitors,
    };
  }

  debrief(): Debrief {
    const s = this.state;
    const r1 = s.rounds['1'];
    const r2 = s.rounds['2'];
    const allOf = (rec?: RoundRecord) => rec?.markets.flatMap((m) => m.results) ?? [];
    const a1 = allOf(r1);
    const a2 = allOf(r2);
    const humanIds = new Set(s.players.map((p) => p.id));
    const h1 = a1.filter((r) => humanIds.has(r.id));
    const h2 = a2.filter((r) => humanIds.has(r.id));

    const rounds: Debrief['rounds'] = {};
    for (const [r, rec] of [[1, r1], [2, r2]] as const) {
      if (!rec) continue;
      const hist: Record<number, number> = Object.fromEntries(PRICE_OPTIONS.map((p) => [p, 0]));
      allOf(rec).forEach((x) => (hist[x.price] = (hist[x.price] ?? 0) + 1));
      rounds[r] = {
        avgPrice: rec.avgPrice,
        avgProfit: rec.totalProfit / rec.totalCompetitors,
        totalUnits: rec.totalUnits,
        totalRevenue: rec.totalRevenue,
        totalProfit: rec.totalProfit,
        moves: rec.moves,
        priceHistogram: hist,
      };
    }

    const right = (l: Letter) => COMPANY_BY_LETTER[l].rightPrice;
    const counterfactuals: ScenarioOutcome[] = [
      ...(r1 ? [this.actualScenario('actual1', 'Actual · Round 1', r1)] : []),
      ...(r2 ? [this.actualScenario('actual2', 'Actual · Round 2', r2)] : []),
      this.scenario('hold', 'Everyone holds at QAR 1,000', () => REFERENCE_PRICE),
      this.scenario('right', 'Everyone at their dossier right price', right),
      this.scenario('smbcut', 'Right prices, but SMB cluster (B, F, J) cuts 100', (l) =>
        (SMB_CLUSTER as readonly string[]).includes(l) ? right(l) - 100 : right(l),
      ),
    ];

    const pct = (k: number, n: number) => (n ? k / n : null);
    const rightOf = (id: string) => PROFILE_BY_ID[s.players.find((p) => p.id === id)!.profileId].rightPrice;
    const guessed = s.players.filter((p) => s.guesses[p.id] !== undefined);
    const correct = guessed.filter((p) => s.guesses[p.id] === h1.find((r) => r.id === p.id)?.primaryCompetitorId);

    const both = s.players.filter((p) => h1.some((x) => x.id === p.id) && h2.some((x) => x.id === p.id));
    const change = both.map((p) => h2.find((x) => x.id === p.id)!.price - h1.find((x) => x.id === p.id)!.price);

    const qRound: RoundNo = r2 ? 2 : 1;
    const qAll = qRound === 2 ? a2 : a1;
    const playerById = new Map(s.players.map((p) => [p.id, p]));
    const quadrant = qAll.map((r) => {
      const p = playerById.get(r.id);
      return {
        id: r.id,
        kind: r.kind,
        label: p ? `${p.codename} · ${r.company}` : `${r.company} (AI)`,
        x: r.shareChangePp,
        y: r.statusQuoProfit !== 0 ? ((r.profit - r.statusQuoProfit) / Math.abs(r.statusQuoProfit)) * 100 : 0,
      };
    });

    const byId2 = new Map(a2.map((r) => [r.id, r]));
    const leaderboard: LeaderRow[] = a1.map((x) => {
      const p = playerById.get(x.id);
      const y = byId2.get(x.id);
      const g = p ? s.guesses[p.id] : undefined;
      return {
        id: x.id,
        kind: x.kind,
        player: p ? `${p.codename} · ${p.name}` : null,
        company: x.company,
        letter: x.letter,
        archetype: COMPANY_BY_LETTER[x.letter].archetype,
        market: x.marketIndex,
        r1Price: x.price,
        r2Price: y?.price ?? null,
        r1Profit: x.profit,
        r2Profit: y?.profit ?? null,
        r1SharePp: x.shareChangePp,
        r2SharePp: y?.shareChangePp ?? null,
        guessCorrect: g === undefined ? null : g === x.primaryCompetitorId,
      };
    });
    leaderboard.sort((a, b) => (b.r2Profit ?? b.r1Profit ?? 0) - (a.r2Profit ?? a.r1Profit ?? 0));

    return {
      rounds,
      counterfactuals,
      stats: {
        humans: s.players.length,
        pctAtRightR1: pct(h1.filter((r) => r.price === rightOf(r.id)).length, h1.length),
        pctNearRightR1: pct(h1.filter((r) => Math.abs(r.price - rightOf(r.id)) <= 50).length, h1.length),
        guesses: guessed.length,
        pctGuessCorrect: pct(correct.length, guessed.length),
        medianCapturedR1: median(h1.map((r) => r.captured).filter((c): c is number => c !== null)),
        medianCapturedR2: median(h2.map((r) => r.captured).filter((c): c is number => c !== null)),
      },
      learning: {
        avgProfitR1: avg(h1.map((x) => x.profit)),
        avgProfitR2: avg(h2.map((x) => x.profit)),
        avgPriceR1: avg(h1.map((x) => x.price)),
        avgPriceR2: avg(h2.map((x) => x.price)),
        pctChanged: pct(change.filter((c) => c !== 0).length, both.length),
        pctUp: pct(change.filter((c) => c > 0).length, both.length),
        pctDown: pct(change.filter((c) => c < 0).length, both.length),
      },
      markets: Array.from({ length: s.marketCount }, (_, i) => {
        const m1 = r1?.markets[i];
        const m2 = r2?.markets[i];
        return {
          index: i,
          humans: s.players.filter((p) => p.marketIndex === i).length,
          r1: m1 ? { avgPrice: m1.avgPrice, totalProfit: m1.totalProfit } : null,
          r2: m2 ? { avgPrice: m2.avgPrice, totalProfit: m2.totalProfit } : null,
        };
      }),
      quadrantRound: qRound,
      quadrant,
      leaderboard,
    };
  }

  // --------------------------------------------------------------------------
  //  CSV export
  // --------------------------------------------------------------------------
  playersCsv(): string {
    const s = this.state;
    const cols = [
      'player_id', 'name', 'codename', 'is_demo', 'market', 'archetype_letter', 'company_archetype', 'company',
      'variable_cost', 'fixed_cost', 'right_price', 'max_wtp', 'start_customers', 'start_share',
      'round1_price', 'round1_defaulted', 'round1_units', 'round1_market_share', 'round1_share_change_pp', 'round1_revenue', 'round1_profit',
      'round1_best_price_given_competitors', 'round1_profit_captured', 'primary_competitor_r1', 'guess', 'guess_correct',
      'round2_price', 'round2_defaulted', 'round2_units', 'round2_market_share', 'round2_share_change_pp', 'round2_revenue', 'round2_profit',
      'round2_best_price_given_competitors', 'round2_profit_captured', 'r2_primary_competitor',
      'price_change', 'market_share_change', 'revenue_change', 'profit_change',
    ];
    const find = (rec: RoundRecord | undefined, id: string) => rec?.markets.flatMap((m) => m.results).find((r) => r.id === id);
    const nameOf = (rec: RoundRecord | undefined, id: string | undefined) =>
      id ? rec?.markets.flatMap((m) => m.results).find((r) => r.id === id)?.company ?? id : '';
    const rows = s.players.map((p) => {
      const prof = PROFILE_BY_ID[p.profileId];
      const a = find(s.rounds['1'], p.id);
      const b = find(s.rounds['2'], p.id);
      const g = s.guesses[p.id];
      const cap = (x?: CompetitorResult) => (x?.captured != null ? x.captured.toFixed(4) : '');
      return [
        p.id, p.name, p.codename, p.isDemo, p.marketIndex !== null ? p.marketIndex + 1 : '', prof.letter, prof.archetype, prof.company,
        prof.vc, prof.fc, prof.rightPrice, prof.maxWtp, prof.startCustomers, a ? a.startShare.toFixed(5) : '',
        a?.price ?? '', a ? a.defaulted : '', a?.units ?? '', a ? a.share.toFixed(5) : '', a ? a.shareChangePp.toFixed(2) : '', a?.revenue ?? '', a?.profit ?? '',
        a?.bestPrice ?? '', cap(a), nameOf(s.rounds['1'], a?.primaryCompetitorId), nameOf(s.rounds['1'], g), g && a ? g === a.primaryCompetitorId : '',
        b?.price ?? '', b ? b.defaulted : '', b?.units ?? '', b ? b.share.toFixed(5) : '', b ? b.shareChangePp.toFixed(2) : '', b?.revenue ?? '', b?.profit ?? '',
        b?.bestPrice ?? '', cap(b), nameOf(s.rounds['2'], b?.primaryCompetitorId),
        a && b ? b.price - a.price : '', a && b ? ((b.share - a.share) * 100).toFixed(2) : '', a && b ? b.revenue - a.revenue : '', a && b ? b.profit - a.profit : '',
      ];
    });
    return toCsv([cols, ...rows]);
  }

  marketCsv(): string {
    const s = this.state;
    const lines: (string | number | boolean)[][] = [
      ['section', 'market', 'round', 'avg_price', 'total_customers', 'total_revenue', 'total_profit', 'cut', 'hold', 'raise', 'humans'],
    ];
    for (const r of [1, 2] as RoundNo[]) {
      const rec = s.rounds[r];
      if (!rec) continue;
      for (const m of rec.markets) {
        lines.push(['market', m.index + 1, r, m.avgPrice.toFixed(2), m.totalUnits, m.totalRevenue, m.totalProfit, m.moves.cut, m.moves.hold, m.moves.raise, m.humans]);
      }
      lines.push(['room', 'all', r, rec.avgPrice.toFixed(2), rec.totalUnits, rec.totalRevenue, rec.totalProfit, rec.moves.cut, rec.moves.hold, rec.moves.raise, rec.humans]);
    }
    if (s.rounds['1']) {
      lines.push([]);
      lines.push(['counterfactual', 'scenario', 'avg_price', 'total_customers', 'total_revenue', 'total_profit', 'avg_profit']);
      for (const c of this.debrief().counterfactuals) {
        lines.push(['counterfactual', c.label, c.avgPrice.toFixed(2), c.totalUnits, c.totalRevenue, c.totalProfit, Math.round(c.avgProfit)]);
      }
      lines.push([]);
      lines.push(['competitor', 'market', 'id', 'kind', 'letter', 'company', 'round1_price', 'round1_units', 'round1_share_change_pp', 'round1_profit', 'round2_price', 'round2_units', 'round2_share_change_pp', 'round2_profit']);
      const r2 = s.rounds['2']?.markets.flatMap((m) => m.results) ?? [];
      for (const a of s.rounds['1'].markets.flatMap((m) => m.results)) {
        const b = r2.find((x) => x.id === a.id);
        lines.push([
          'competitor', a.marketIndex + 1, a.id, a.kind, a.letter, a.company, a.price, a.units, a.shareChangePp.toFixed(2), a.profit,
          b?.price ?? '', b?.units ?? '', b ? b.shareChangePp.toFixed(2) : '', b?.profit ?? '',
        ]);
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
