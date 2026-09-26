// Types shared by the server and the browser. The server is authoritative;
// the browser only ever sends a player token and a price.

export const PRICE_OPTIONS = [800, 900, 1000, 1100, 1200] as const;
export type Price = (typeof PRICE_OPTIONS)[number];
export type RoundNo = 1 | 2;

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

/** Confidential economics of one company. */
export interface Economics {
  customerValue: number;
  elasticity: number;
  variableCost: number;
  fixedCost: number;
}

export interface CompanyProfile extends Economics {
  id: string;
  dossier: string; // "A".."J"
  archetype: string; // "Premium Specialist"
  company: string; // "Lumina AI"
  product: string;
  sensitivityLabel: string; // "Low", "High"...
  position: string;
  founderNote: string;
}

export interface TimerState {
  durationMs: number;
  endsAt: number | null; // epoch ms, null when paused
  remainingMs: number; // authoritative when paused
  paused: boolean;
}

export interface CompetitorResult {
  id: string;
  kind: 'human' | 'ai';
  price: Price;
  defaulted: boolean;
  attractiveness: number;
  marketShare: number; // 0..1
  units: number; // whole customers
  revenue: number;
  variableCostTotal: number;
  fixedCost: number;
  profit: number;
  profitRank: number;
  shareRank: number;
}

export interface MoveStats {
  cut: number;
  hold: number;
  raise: number;
  pctCut: number;
  pctHold: number;
  pctRaise: number;
}

export interface RoundRecord {
  round: RoundNo;
  resolvedAt: number;
  totalCompetitors: number;
  humans: number;
  avgPrice: number;
  demandFactor: number;
  baseDemand: number;
  totalDemand: number;
  totalRevenue: number;
  totalProfit: number;
  moves: MoveStats;
  results: CompetitorResult[];
}

/** What a participant is allowed to know about a round. */
export interface MyRoundResult {
  round: RoundNo;
  price: Price;
  defaulted: boolean;
  marketShare: number;
  units: number;
  revenue: number;
  variableCostTotal: number;
  fixedCost: number;
  profit: number;
  profitRank: number;
  shareRank: number;
  totalCompetitors: number;
  avgPrice: number;
  totalDemand: number;
}

export interface PublicMarketInfo {
  round: RoundNo;
  avgPrice: number;
  totalDemand: number;
  pctCut: number;
  pctHold: number;
  pctRaise: number;
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
    decisions: Partial<Record<RoundNo, Price>>;
    results: Partial<Record<RoundNo, MyRoundResult>>;
  };
  market: Partial<Record<RoundNo, PublicMarketInfo>>;
}

export interface HostPlayerRow {
  id: string;
  name: string;
  codename: string;
  archetype: string;
  company: string;
  isDemo: boolean;
  connected: boolean;
  token?: string; // only for demo players, so the host can preview their screens
  decisions: Partial<Record<RoundNo, Price>>;
}

export interface HostAiRow {
  id: string;
  name: string;
  archetype: string;
  economics: Economics;
  decisions: Partial<Record<RoundNo, Price>>;
}

export interface ScenarioOutcome {
  label: string;
  key: string;
  avgPrice: number;
  totalDemand: number;
  totalRevenue: number;
  totalProfit: number;
  avgProfit: number;
}

export interface Debrief {
  rounds: Partial<Record<RoundNo, {
    avgPrice: number;
    avgProfit: number;
    avgRevenue: number;
    avgShare: number;
    moves: MoveStats;
    totalDemand: number;
    totalRevenue: number;
    totalProfit: number;
    priceHistogram: Record<Price, number>;
  }>>;
  counterfactuals: ScenarioOutcome[];
  learning: {
    humans: number;
    avgProfitR1: number | null;
    avgProfitR2: number | null;
    avgPriceR1: number | null;
    avgPriceR2: number | null;
    pctChanged: number | null;
    pctUp: number | null;
    pctDown: number | null;
  };
  leaderboard: {
    id: string;
    label: string;
    kind: 'human' | 'ai';
    archetype: string;
    r1Profit: number | null;
    r2Profit: number | null;
    r1Price: Price | null;
    r2Price: Price | null;
  }[];
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
    totalCompetitors: number;
    aiCompetitors: number;
    submissions: number;
    expectedSubmissions: number;
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
