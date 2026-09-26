import type { CompetitorResult, Economics, MoveStats, Price } from '../../../shared/types';
import {
  BASE_DEMAND_PER_COMPETITOR,
  GLOBAL_DEMAND_MAX,
  GLOBAL_DEMAND_MIN,
  GLOBAL_DEMAND_SENSITIVITY,
  REFERENCE_PRICE,
} from './params';

export interface MarketEntry extends Economics {
  id: string;
  kind: 'human' | 'ai';
  price: Price;
  defaulted?: boolean;
}

export interface MarketOutcome {
  totalCompetitors: number;
  avgPrice: number;
  demandFactor: number;
  baseDemand: number;
  totalDemand: number; // exact
  totalRevenue: number;
  totalProfit: number;
  moves: MoveStats;
  results: CompetitorResult[];
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function demandFactorFor(avgPrice: number): number {
  return clamp(
    1 + (GLOBAL_DEMAND_SENSITIVITY * (REFERENCE_PRICE - avgPrice)) / REFERENCE_PRICE,
    GLOBAL_DEMAND_MIN,
    GLOBAL_DEMAND_MAX,
  );
}

export function attractiveness(e: Economics, price: number): number {
  const valueMultiplier = e.customerValue / REFERENCE_PRICE;
  const priceRatio = price / REFERENCE_PRICE;
  return valueMultiplier * Math.pow(priceRatio, -e.elasticity);
}

export function moveStats(prices: number[]): MoveStats {
  const n = prices.length || 1;
  const cut = prices.filter((p) => p < REFERENCE_PRICE).length;
  const hold = prices.filter((p) => p === REFERENCE_PRICE).length;
  const raise = prices.filter((p) => p > REFERENCE_PRICE).length;
  return { cut, hold, raise, pctCut: cut / n, pctHold: hold / n, pctRaise: raise / n };
}

/**
 * Split an exact total into whole customers per company (largest remainder),
 * so every displayed number adds up: revenue = customers × price, etc.
 */
function apportion(exact: number[]): number[] {
  const floors = exact.map(Math.floor);
  const target = Math.round(exact.reduce((a, b) => a + b, 0));
  let remaining = target - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors;
}

function rankBy(values: number[]): number[] {
  // rank 1 = highest; ties share the better rank
  return values.map((v) => 1 + values.filter((o) => o > v).length);
}

/** Clear one shared market. Pure and deterministic. */
export function clearMarket(entries: MarketEntry[]): MarketOutcome {
  const n = entries.length;
  const avgPrice = entries.reduce((s, c) => s + c.price, 0) / n;
  const demandFactor = demandFactorFor(avgPrice);
  const baseDemand = BASE_DEMAND_PER_COMPETITOR * n;
  const totalDemand = baseDemand * demandFactor;

  const attr = entries.map((c) => attractiveness(c, c.price));
  const sumAttr = attr.reduce((a, b) => a + b, 0);
  const shares = attr.map((a) => a / sumAttr);
  const units = apportion(shares.map((s) => s * totalDemand));

  const revenue = entries.map((c, i) => units[i] * c.price);
  const vc = entries.map((c, i) => units[i] * c.variableCost);
  const profit = entries.map((c, i) => revenue[i] - vc[i] - c.fixedCost);
  const profitRank = rankBy(profit);
  const shareRank = rankBy(shares);

  const results: CompetitorResult[] = entries.map((c, i) => ({
    id: c.id,
    kind: c.kind,
    price: c.price,
    defaulted: !!c.defaulted,
    attractiveness: attr[i],
    marketShare: shares[i],
    units: units[i],
    revenue: revenue[i],
    variableCostTotal: vc[i],
    fixedCost: c.fixedCost,
    profit: profit[i],
    profitRank: profitRank[i],
    shareRank: shareRank[i],
  }));

  return {
    totalCompetitors: n,
    avgPrice,
    demandFactor,
    baseDemand,
    totalDemand,
    totalRevenue: revenue.reduce((a, b) => a + b, 0),
    totalProfit: profit.reduce((a, b) => a + b, 0),
    moves: moveStats(entries.map((e) => e.price)),
    results,
  };
}

/**
 * Exact (un-rounded) profit for one company given everyone's prices.
 * Used by calibration tests and by strategic bots to evaluate best responses.
 */
export function exactProfit(entries: MarketEntry[], index: number, price: number): number {
  const prices = entries.map((e, i) => (i === index ? price : e.price));
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const demand = BASE_DEMAND_PER_COMPETITOR * entries.length * demandFactorFor(avg);
  const attr = entries.map((e, i) => attractiveness(e, prices[i]));
  const sum = attr.reduce((a, b) => a + b, 0);
  const u = (demand * attr[index]) / sum;
  const me = entries[index];
  return u * (price - me.variableCost) - me.fixedCost;
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
