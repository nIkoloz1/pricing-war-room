import type { CompetitorResult, Letter, MoveStats, Price } from '../../../shared/types';
import { COMPANIES, COMPANY_BY_LETTER } from './companies';
import { KAPPA, LAMBDA, MAX_PRICE, MIN_PRICE, PRICE_GRID, REFERENCE_PRICE } from './params';

// ============================================================================
//  Engine: linear demand per company + similarity-weighted switching.
//
//  Each company k has a total slope T_k (customers lost per QAR it raises while
//  rivals hold at 1,000), chosen so its profit-maximising price is its dossier
//  right price. Part of that slope, C_k, is customers switching to similar rivals;
//  the rest, b_k, is customers who stop buying. Switching between j and k is
//  c_jk = LAMBDA × similarity × sqrt(T_j × T_k), symmetric, so customers are conserved.
// ============================================================================

export interface Coef {
  T: number; // total slope with rivals at 1,000
  C: number; // switching slope (sum of c_kj)
  b: number; // own slope
  P: number; // own choke price
  maxWtp: number; // REF + q0 / T  (= 2R − VC)
  switchShare: number; // C / T
}

const dist = (a: Letter, b: Letter) => {
  const p = COMPANY_BY_LETTER[a].position;
  const q = COMPANY_BY_LETTER[b].position;
  return Math.hypot(p.x - q.x, p.y - q.y);
};

/** s_jk = exp(−KAPPA · distance); 0 with itself. */
export function similarity(a: Letter, b: Letter): number {
  return a === b ? 0 : Math.exp(-KAPPA * dist(a, b));
}

const T: Record<string, number> = {};
for (const c of COMPANIES) T[c.letter] = c.startCustomers / (2 * c.rightPrice - c.vc - REFERENCE_PRICE);

/** Switching coefficient c_jk, customers per QAR of price gap. */
export const SWITCH = {} as Record<Letter, Record<Letter, number>>;
for (const a of COMPANIES) {
  SWITCH[a.letter] = {} as Record<Letter, number>;
  for (const b of COMPANIES) {
    SWITCH[a.letter][b.letter] = a.letter === b.letter ? 0 : LAMBDA * similarity(a.letter, b.letter) * Math.sqrt(T[a.letter] * T[b.letter]);
  }
}

export const COEF = {} as Record<Letter, Coef>;
for (const c of COMPANIES) {
  const t = T[c.letter];
  const C = Object.values(SWITCH[c.letter]).reduce((s, v) => s + v, 0);
  const b = t - C;
  COEF[c.letter] = {
    T: t,
    C,
    b,
    P: REFERENCE_PRICE + c.startCustomers / b,
    maxWtp: REFERENCE_PRICE + c.startCustomers / t,
    switchShare: C / t,
  };
}

/** Customers if every competitor stays at 1,000 (the dossier demand table). */
export function dossierCustomers(letter: Letter, price: number): number {
  const k = COEF[letter];
  return Math.max(0, Math.round(k.T * (k.maxWtp - price)));
}

/** Round to the nearest grid price. */
export function snap(price: number): Price {
  const p = Math.round(price / 50) * 50;
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, p));
}

export function isGridPrice(p: unknown): p is Price {
  return typeof p === 'number' && PRICE_GRID.includes(p);
}

/** How many QAR your best price moves per QAR 100 that rival moves, rounded to 5. */
export function reactionPer100(me: Letter, rival: Letter): number {
  return Math.round(((SWITCH[me][rival] / (2 * COEF[me].T)) * 100) / 5) * 5;
}

export function statusQuoProfit(letter: Letter): number {
  const c = COMPANY_BY_LETTER[letter];
  return c.startCustomers * (REFERENCE_PRICE - c.vc) - c.fc;
}

// ---------------------------------------------------------------------------
export interface MarketEntry {
  id: string;
  kind: 'human' | 'ai';
  letter: Letter;
  company: string;
  price: Price;
  defaulted?: boolean;
}

/** Exact (un-rounded) customers for every entry at the given prices. */
export function exactUnitsAll(entries: MarketEntry[], prices: number[] = entries.map((e) => e.price)): number[] {
  return entries.map((e, j) => {
    const k = COEF[e.letter];
    let flow = 0;
    entries.forEach((o, i) => {
      if (i !== j) flow += SWITCH[e.letter][o.letter] * (prices[i] - prices[j]);
    });
    return Math.max(0, k.b * (k.P - prices[j]) + flow);
  });
}

function withPrice(entries: MarketEntry[], index: number, price: number): number[] {
  return entries.map((e, i) => (i === index ? price : e.price));
}

/** Exact profit (continuous customers) for entries[index] if it charged `price`. */
export function exactProfit(entries: MarketEntry[], index: number, price: number): number {
  const u = exactUnitsAll(entries, withPrice(entries, index, price))[index];
  const c = COMPANY_BY_LETTER[entries[index].letter];
  return u * (price - c.vc) - c.fc;
}

/** Profit with whole customers, exactly as the market would pay it. */
export function paidProfit(entries: MarketEntry[], index: number, price: number): number {
  const u = Math.round(exactUnitsAll(entries, withPrice(entries, index, price))[index]);
  const c = COMPANY_BY_LETTER[entries[index].letter];
  return u * (price - c.vc) - c.fc;
}

/** Grid search on exact profit; ties go to the price closer to the current one. */
export function bestResponse(entries: MarketEntry[], index: number): Price {
  const current = entries[index].price;
  let best = PRICE_GRID[0];
  let bestProfit = -Infinity;
  for (const p of PRICE_GRID) {
    const v = exactProfit(entries, index, p);
    if (v > bestProfit + 1e-9 || (Math.abs(v - bestProfit) <= 1e-9 && Math.abs(p - current) < Math.abs(best - current))) {
      best = p;
      bestProfit = v;
    }
  }
  return best;
}

export interface Flow {
  id: string;
  letter: Letter;
  company: string;
  similarity: number;
  /** + customers entries[index] wins from this competitor, − customers it loses to them */
  flow: number;
}

/** flow_jk = c_jk × (p_k − p_j) for every competitor k of entries[index]. */
export function flowsFor(entries: MarketEntry[], index: number): Flow[] {
  const me = entries[index];
  return entries
    .filter((_, i) => i !== index)
    .map((o) => ({
      id: o.id,
      letter: o.letter,
      company: o.company,
      similarity: similarity(me.letter, o.letter),
      flow: SWITCH[me.letter][o.letter] * (o.price - me.price),
    }));
}

/**
 * Largest |flow|; ties → higher similarity. If no flow reaches half a customer,
 * the most similar competitor.
 */
export function primaryCompetitor(entries: MarketEntry[], index: number): string {
  const flows = flowsFor(entries, index);
  const bySim = [...flows].sort((a, b) => b.similarity - a.similarity);
  const byFlow = [...flows].sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow) || b.similarity - a.similarity);
  if (!byFlow.length) return '';
  return Math.abs(byFlow[0].flow) < 0.5 ? bySim[0].id : byFlow[0].id;
}

export function moveStats(prices: number[]): MoveStats {
  const n = prices.length || 1;
  const cut = prices.filter((p) => p < REFERENCE_PRICE).length;
  const hold = prices.filter((p) => p === REFERENCE_PRICE).length;
  const raise = prices.filter((p) => p > REFERENCE_PRICE).length;
  return { cut, hold, raise, pctCut: cut / n, pctHold: hold / n, pctRaise: raise / n };
}

const rankBy = (values: number[]) => values.map((v) => 1 + values.filter((o) => o > v).length);

export interface MarketOutcome {
  avgPrice: number;
  totalUnits: number;
  totalRevenue: number;
  totalProfit: number;
  moves: MoveStats;
  results: CompetitorResult[];
}

/** Clear one market of (normally) ten companies. Pure and deterministic. */
export function clearMarket(entries: MarketEntry[], marketIndex = 0): MarketOutcome {
  const exact = exactUnitsAll(entries);
  const units = exact.map((u) => Math.round(u));
  const totalUnits = units.reduce((a, b) => a + b, 0);
  const q0Total = entries.reduce((s, e) => s + COMPANY_BY_LETTER[e.letter].startCustomers, 0);
  const profit = entries.map((e, i) => {
    const c = COMPANY_BY_LETTER[e.letter];
    return units[i] * (e.price - c.vc) - c.fc;
  });
  const profitRank = rankBy(profit);

  const results: CompetitorResult[] = entries.map((e, i) => {
    const c = COMPANY_BY_LETTER[e.letter];
    const share = totalUnits > 0 ? units[i] / totalUnits : 0;
    const startShare = c.startCustomers / q0Total;
    const bestPrice = bestResponse(entries, i);
    const bestProfit = paidProfit(entries, i, bestPrice);
    return {
      id: e.id,
      kind: e.kind,
      marketIndex,
      letter: e.letter,
      company: e.company,
      price: e.price,
      defaulted: !!e.defaulted,
      exactUnits: exact[i],
      units: units[i],
      revenue: units[i] * e.price,
      variableCostTotal: units[i] * c.vc,
      fixedCost: c.fc,
      profit: profit[i],
      share,
      startShare,
      shareChangePp: (share - startShare) * 100,
      statusQuoProfit: statusQuoProfit(e.letter),
      profitRank: profitRank[i],
      primaryCompetitorId: primaryCompetitor(entries, i),
      bestPrice,
      bestProfit,
      captured: bestProfit > 0 ? profit[i] / bestProfit : null,
    };
  });

  return {
    avgPrice: entries.reduce((s, e) => s + e.price, 0) / (entries.length || 1),
    totalUnits,
    totalRevenue: results.reduce((s, r) => s + r.revenue, 0),
    totalProfit: results.reduce((s, r) => s + r.profit, 0),
    moves: moveStats(entries.map((e) => e.price)),
    results,
  };
}

// ---------------------------------------------------------------------------
// Deterministic randomness (seeded), so games are reproducible in testing.
// ---------------------------------------------------------------------------
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(...parts: (string | number)[]): () => number {
  return mulberry32(hashString(parts.join('|')));
}

/** Pick an option from weights using a seeded random source. */
export function pickWeighted<T>(options: readonly T[], weights: number[], rand: () => number): T {
  const w = weights.map((x) => Math.max(0, x));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return options[Math.floor(options.length / 2)];
  let r = rand() * total;
  for (let i = 0; i < options.length; i++) {
    r -= w[i];
    if (r < 0) return options[i];
  }
  return options[options.length - 1];
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
