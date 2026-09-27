// Types shared by the server and the browser. The server is authoritative;
// the browser only ever sends a player token, a price and (in Round 2) a guess.

/** QAR 700 … 1,450 in steps of 50. Both rounds use the same grid. */
export const PRICE_OPTIONS: number[] = Array.from({ length: 16 }, (_, i) => 700 + 50 * i);
export type Price = number;
export type RoundNo = 1 | 2;
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export type Phase =
  | 'registration'
  | 'r1_decision'
  | 'r1_clearing'
  | 'r1_results'
  | 'workshop'
  | 'r2_decision'
  | 'r2_clearing'
  | 'r2_results'
  | 'debrief';

export const PHASE_LABEL: Record<Phase, string> = {
  registration: 'Registration',
  r1_decision: 'Round 1',
  r1_clearing: 'Round 1 · Clearing',
  r1_results: 'Round 1 · Results',
  workshop: 'Workshop',
  r2_decision: 'Round 2',
  r2_clearing: 'Round 2 · Clearing',
  r2_results: 'Round 2 · Results',
  debrief: 'Debrief',
};

export interface EveLine {
  label: string;
  amount: number;
}

/** A participant's confidential dossier. */
export interface CompanyProfile {
  id: string;
  letter: Letter;
  archetype: string; // "Premium Specialist"
  company: string; // "Lumina AI"
  product: string;
  segment: string;
  positionText: string;
  founderNote: string;
  position: { x: number; y: number };
  vc: number;
  fc: number;
  rightPrice: number;
  startCustomers: number;
  churn: number; // monthly, 0.02 = 2%
  maxWtp: number;
  eve: { reference: number; plus: EveLine; minus: EveLine };
  /** T: customers lost per QAR you raise (rivals at 1,000) */
  customersPerQar: number;
  /** share of lost customers that switch to similar competitors */
  switchShare: number;
  demandTable: { price: number; customers: number }[];
}

export interface TimerState {
  durationMs: number;
  endsAt: number | null; // epoch ms, null when paused
  remainingMs: number; // authoritative when paused
  paused: boolean;
}

export interface MoveStats {
  cut: number;
  hold: number;
  raise: number;
  pctCut: number;
  pctHold: number;
  pctRaise: number;
}

export interface CompetitorResult {
  id: string;
  kind: 'human' | 'ai';
  marketIndex: number;
  letter: Letter;
  company: string;
  price: Price;
  defaulted: boolean;
  exactUnits: number;
  units: number; // whole customers
  revenue: number;
  variableCostTotal: number;
  fixedCost: number;
  profit: number;
  share: number; // 0..1 within its market
  startShare: number;
  shareChangePp: number; // percentage points vs start share
  statusQuoProfit: number; // everyone at 1,000
  profitRank: number; // within its market, 1 = best
  primaryCompetitorId: string;
  bestPrice: Price; // best response to what competitors actually did
  bestProfit: number; // profit at that price (whole customers)
  captured: number | null; // profit ÷ bestProfit
}

export interface MarketRecord {
  index: number;
  humans: number;
  avgPrice: number;
  totalUnits: number;
  totalRevenue: number;
  totalProfit: number;
  moves: MoveStats;
  results: CompetitorResult[];
}

export interface RoundRecord {
  round: RoundNo;
  resolvedAt: number;
  totalCompetitors: number;
  humans: number;
  avgPrice: number;
  totalUnits: number;
  totalRevenue: number;
  totalProfit: number;
  moves: MoveStats;
  markets: MarketRecord[];
}

export interface CompetitorRow {
  id: string;
  company: string;
  segment: string;
  letter: Letter;
  similarity: number; // 0..1
  price: Price;
}

export interface FlowRow {
  id: string;
  company: string;
  similarity: number;
  /** + customers you won from them, − customers you lost to them */
  customers: number;
}

/** What a participant is allowed to know about a round. */
export interface MyRoundResult {
  round: RoundNo;
  price: Price;
  defaulted: boolean;
  units: number;
  revenue: number;
  variableCostTotal: number;
  fixedCost: number;
  profit: number;
  share: number;
  startCustomers: number;
  startShare: number;
  shareChangePp: number;
  statusQuoProfit: number;
  profitRank: number;
  marketSize: number;
  dossierRightPrice: number;
  bestGivenCompetitors: { price: Price; profit: number };
  competitors: CompetitorRow[]; // sorted by similarity, most similar first
  /** Only once the player may see them (after the Round 2 guess, or after Round 2). */
  flows?: FlowRow[];
  primaryCompetitorId?: string;
}

export interface PublicMarketInfo {
  round: RoundNo;
  avgPrice: number;
  totalUnits: number;
  pctCut: number;
  pctHold: number;
  pctRaise: number;
}

export interface QuizOption {
  id: string;
  company: string;
  segment: string;
  similarity: number;
  r1Price: Price;
}

export interface BestResponseTable {
  rivalId: string;
  rivalCompany: string;
  rivalR1Price: Price;
  /** QAR your best price moves per QAR 100 the rival moves (rounded to 5) */
  reactionPer100: number;
  rows: { rivalPrice: Price; bestPrice: Price; profit: number }[];
}

export interface Round2Desk {
  options: QuizOption[];
  guess: string | null;
  reveal: null | {
    correct: boolean;
    primaryId: string;
    primaryCompany: string;
    flows: FlowRow[];
    table: BestResponseTable;
  };
}

export interface PlayerView {
  kind: 'player';
  serverNow: number;
  session: {
    code: string;
    phase: Phase;
    registrationOpen: boolean;
    timer: TimerState | null;
  };
  me: {
    id: string;
    name: string;
    codename: string;
    profile: CompanyProfile;
    marketIndex: number | null;
    /** Starting position, shown once Round 1 opens. */
    start: { customers: number; share: number } | null;
    decisions: Partial<Record<RoundNo, Price>>;
    results: Partial<Record<RoundNo, MyRoundResult>>;
  };
  market: Partial<Record<RoundNo, PublicMarketInfo>>;
  desk: Round2Desk | null;
}

export interface HostPlayerRow {
  id: string;
  name: string;
  codename: string;
  letter: Letter;
  archetype: string;
  company: string;
  isDemo: boolean;
  connected: boolean;
  marketIndex: number | null;
  token?: string; // only for demo players, so the host can preview their screens
  decisions: Partial<Record<RoundNo, Price>>;
  guess: { company: string; correct: boolean } | null;
}

export interface HostAiRow {
  id: string;
  name: string;
  letter: Letter;
  archetype: string;
  personality: string;
  marketIndex: number;
  vc: number;
  fc: number;
  rightPrice: number;
  decisions: Partial<Record<RoundNo, Price>>;
}

export interface ScenarioOutcome {
  label: string;
  key: string;
  avgPrice: number;
  totalUnits: number;
  totalRevenue: number;
  totalProfit: number;
  avgProfit: number;
}

export interface LeaderRow {
  id: string;
  kind: 'human' | 'ai';
  player: string | null;
  company: string;
  letter: Letter;
  archetype: string;
  market: number; // 0-based
  r1Price: Price | null;
  r2Price: Price | null;
  r1Profit: number | null;
  r2Profit: number | null;
  r1SharePp: number | null;
  r2SharePp: number | null;
  guessCorrect: boolean | null;
}

export interface QuadrantPoint {
  id: string;
  kind: 'human' | 'ai';
  label: string;
  x: number; // share change, pp vs start
  y: number; // profit change, % vs status-quo profit
}

export interface Debrief {
  rounds: Partial<Record<RoundNo, {
    avgPrice: number;
    avgProfit: number;
    totalUnits: number;
    totalRevenue: number;
    totalProfit: number;
    moves: MoveStats;
    priceHistogram: Record<number, number>;
  }>>;
  counterfactuals: ScenarioOutcome[];
  stats: {
    humans: number;
    pctAtRightR1: number | null;
    pctNearRightR1: number | null;
    guesses: number;
    pctGuessCorrect: number | null;
    medianCapturedR1: number | null;
    medianCapturedR2: number | null;
  };
  learning: {
    avgProfitR1: number | null;
    avgProfitR2: number | null;
    avgPriceR1: number | null;
    avgPriceR2: number | null;
    pctChanged: number | null;
    pctUp: number | null;
    pctDown: number | null;
  };
  markets: {
    index: number;
    humans: number;
    r1: { avgPrice: number; totalProfit: number } | null;
    r2: { avgPrice: number; totalProfit: number } | null;
  }[];
  quadrantRound: RoundNo;
  quadrant: QuadrantPoint[];
  leaderboard: LeaderRow[];
}

export interface HostView {
  kind: 'host';
  serverNow: number;
  session: {
    sessionId: string;
    code: string;
    phase: Phase;
    registrationOpen: boolean;
    timer: TimerState | null;
    autoReveal: boolean;
    r1Seconds: number;
    r2Seconds: number;
    createdAt: number;
  };
  counts: {
    humans: number;
    maxHumans: number;
    connected: number;
    markets: number;
    totalCompetitors: number;
    aiCompetitors: number;
    submissions: number;
    expectedSubmissions: number;
    guesses: number;
  };
  players: HostPlayerRow[];
  ai: HostAiRow[];
  rounds: Partial<Record<RoundNo, RoundRecord>>;
  debrief: Debrief | null;
}

export type HostAction =
  | { type: 'reset' }
  | { type: 'openRegistration' }
  | { type: 'lockRegistration' }
  | { type: 'startRound'; round: RoundNo }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'addTime'; seconds: number }
  | { type: 'endRound' }
  | { type: 'reveal' }
  | { type: 'startWorkshop' }
  | { type: 'showDebrief' }
  | { type: 'loadDemo'; count: number }
  | { type: 'removePlayer'; playerId: string }
  | { type: 'setAutoReveal'; value: boolean }
  | { type: 'setDuration'; round: RoundNo; seconds: number };

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}
