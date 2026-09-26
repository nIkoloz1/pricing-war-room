import { PRICE_OPTIONS, type Economics, type Price, type RoundRecord } from '../../../shared/types';
import { exactProfit, pickWeighted, rngFor, type MarketEntry } from './market';
import { REFERENCE_PRICE } from './params';

// ============================================================================
//  AI competitors: fill the market up to MIN_COMPETITORS when attendance is low.
//  Behaviour is deliberately imperfect and deterministic given the session seed.
// ============================================================================

export type Personality =
  | 'premium-leader'
  | 'aggressive-challenger'
  | 'stable-operator'
  | 'value-specialist'
  | 'low-cost'
  | 'retaliator'
  | 'market-follower'
  | 'growth-seeker'
  | 'margin-defender'
  | 'adaptive';

export interface AiArchetype extends Economics {
  personality: Personality;
  archetype: string;
  name: string;
}

/**
 * The order here is the fill order: with 9 humans only the first archetype is
 * used, with 1 human the first nine. It keeps small markets balanced.
 */
export const AI_ARCHETYPES: AiArchetype[] = [
  { personality: 'stable-operator', archetype: 'Stable Operator', name: 'Pinnacle Ops', customerValue: 1100, elasticity: 1.5, variableCost: 280, fixedCost: 30000 },
  { personality: 'aggressive-challenger', archetype: 'Aggressive Challenger', name: 'Rocket Stack', customerValue: 950, elasticity: 2.2, variableCost: 210, fixedCost: 24000 },
  { personality: 'premium-leader', archetype: 'Premium Leader', name: 'Sidra Intelligence', customerValue: 1350, elasticity: 1.0, variableCost: 390, fixedCost: 36000 },
  { personality: 'retaliator', archetype: 'Retaliator', name: 'Bastion Software', customerValue: 1100, elasticity: 1.6, variableCost: 290, fixedCost: 30000 },
  { personality: 'adaptive', archetype: 'Adaptive Competitor', name: 'Mosaic Labs', customerValue: 1150, elasticity: 1.5, variableCost: 300, fixedCost: 31000 },
  { personality: 'low-cost', archetype: 'Low-Cost Player', name: 'LeanGrid', customerValue: 900, elasticity: 2.2, variableCost: 180, fixedCost: 21000 },
  { personality: 'value-specialist', archetype: 'Value Specialist', name: 'Qamar Analytics', customerValue: 1450, elasticity: 0.9, variableCost: 420, fixedCost: 40000 },
  { personality: 'growth-seeker', archetype: 'Growth Seeker', name: 'Echo Automate', customerValue: 1000, elasticity: 2.0, variableCost: 240, fixedCost: 22000 },
  { personality: 'margin-defender', archetype: 'Margin Defender', name: 'Fortis Cloud', customerValue: 1250, elasticity: 1.2, variableCost: 340, fixedCost: 34000 },
  { personality: 'market-follower', archetype: 'Market Follower', name: 'Helix Systems', customerValue: 1050, elasticity: 1.7, variableCost: 290, fixedCost: 28000 },
];

//                     800   900   1000  1100  1200
type W = [number, number, number, number, number];

const ROUND1_WEIGHTS: Record<Personality, W> = {
  'premium-leader':        [0.00, 0.05, 0.25, 0.40, 0.30],
  'aggressive-challenger': [0.45, 0.35, 0.15, 0.05, 0.00],
  'stable-operator':       [0.02, 0.10, 0.70, 0.15, 0.03],
  'value-specialist':      [0.00, 0.00, 0.15, 0.35, 0.50],
  'low-cost':              [0.40, 0.35, 0.20, 0.05, 0.00],
  'retaliator':            [0.00, 0.10, 0.75, 0.15, 0.00],
  'market-follower':       [0.05, 0.15, 0.60, 0.15, 0.05],
  'growth-seeker':         [0.50, 0.35, 0.15, 0.00, 0.00],
  'margin-defender':       [0.00, 0.05, 0.45, 0.35, 0.15],
  'adaptive':              [0.10, 0.20, 0.40, 0.20, 0.10],
};

export interface Round2Context {
  r1Price: Price;
  avgPrice: number;
  pctCut: number;
  pctHold: number;
  pctRaise: number;
  ownProfit: number;
  ownProfitRank: number;
  totalCompetitors: number;
  /** positive when the room cut more than it raised (0..1 scale) */
  pressure: number;
  /** best response to the Round 1 market, evaluated with own economics */
  bestResponse: Price;
}

const idx = (p: number) => PRICE_OPTIONS.indexOf(p as Price);

/** Weight concentrated around a target price, with some spread. */
function around(target: Price, spread = 0.2): W {
  const i = idx(target);
  const w: W = [0, 0, 0, 0, 0];
  for (let k = 0; k < 5; k++) {
    const d = Math.abs(k - i);
    w[k] = d === 0 ? 1 - 2 * spread : d === 1 ? spread : spread / 6;
  }
  return w;
}

const nearestOption = (x: number): Price =>
  PRICE_OPTIONS.reduce((best, p) => (Math.abs(p - x) < Math.abs(best - x) ? p : best), PRICE_OPTIONS[0]);

export function round2Weights(personality: Personality, c: Round2Context): W {
  const heavyCutting = c.pctCut >= 0.5 || c.pressure >= 0.35;
  const calm = c.pctCut < 0.3 && c.avgPrice >= REFERENCE_PRICE - 20;
  const bottomHalf = c.ownProfitRank > c.totalCompetitors / 2;

  switch (personality) {
    case 'premium-leader':
      if (heavyCutting) return [0.00, 0.05, 0.45, 0.35, 0.15];
      if (calm) return [0.00, 0.00, 0.15, 0.40, 0.45];
      return [0.00, 0.05, 0.30, 0.40, 0.25];
    case 'aggressive-challenger':
      if (heavyCutting && bottomHalf) return [0.60, 0.30, 0.10, 0.00, 0.00];
      if (calm) return [0.35, 0.40, 0.20, 0.05, 0.00];
      return [0.45, 0.35, 0.15, 0.05, 0.00];
    case 'stable-operator':
      if (heavyCutting) return [0.05, 0.30, 0.55, 0.10, 0.00];
      return [0.02, 0.08, 0.70, 0.17, 0.03];
    case 'value-specialist':
      if (bottomHalf && c.r1Price >= 1200) return [0.00, 0.05, 0.30, 0.45, 0.20];
      return [0.00, 0.00, 0.10, 0.35, 0.55];
    case 'low-cost':
      if (heavyCutting) return [0.55, 0.30, 0.15, 0.00, 0.00];
      return [0.35, 0.35, 0.25, 0.05, 0.00];
    case 'retaliator':
      if (c.pctCut >= 0.5) return [0.30, 0.45, 0.20, 0.05, 0.00];
      if (c.pctCut >= 0.3) return [0.10, 0.40, 0.45, 0.05, 0.00];
      return [0.00, 0.05, 0.70, 0.25, 0.00];
    case 'market-follower':
      return around(nearestOption(c.avgPrice), 0.2);
    case 'growth-seeker':
      return [0.55, 0.35, 0.10, 0.00, 0.00];
    case 'margin-defender':
      if (heavyCutting) return [0.00, 0.05, 0.55, 0.30, 0.10];
      if (calm) return [0.00, 0.00, 0.30, 0.45, 0.25];
      return [0.00, 0.05, 0.45, 0.35, 0.15];
    case 'adaptive':
      // Usually plays its best response to what it saw, sometimes a neighbour.
      return around(c.bestResponse, 0.15);
  }
}

export function aiRound1Decision(seed: string, aiId: string, a: AiArchetype): Price {
  const rand = rngFor(seed, 'ai', aiId, 'r1');
  return pickWeighted(PRICE_OPTIONS, ROUND1_WEIGHTS[a.personality], rand);
}

/** Best single price for `index` against everyone else's Round 1 prices. */
export function bestResponse(entries: MarketEntry[], index: number): Price {
  let best: Price = PRICE_OPTIONS[0];
  let bestProfit = -Infinity;
  for (const p of PRICE_OPTIONS) {
    const pr = exactProfit(entries, index, p);
    if (pr > bestProfit) {
      bestProfit = pr;
      best = p;
    }
  }
  return best;
}

export function round2Context(r1: RoundRecord, entries: MarketEntry[], id: string): Round2Context {
  const index = entries.findIndex((e) => e.id === id);
  const own = r1.results.find((r) => r.id === id)!;
  return {
    r1Price: own.price,
    avgPrice: r1.avgPrice,
    pctCut: r1.moves.pctCut,
    pctHold: r1.moves.pctHold,
    pctRaise: r1.moves.pctRaise,
    ownProfit: own.profit,
    ownProfitRank: own.profitRank,
    totalCompetitors: r1.totalCompetitors,
    pressure: r1.moves.pctCut - r1.moves.pctRaise,
    bestResponse: bestResponse(entries, index),
  };
}

export function aiRound2Decision(seed: string, aiId: string, a: AiArchetype, ctx: Round2Context): Price {
  const rand = rngFor(seed, 'ai', aiId, 'r2');
  return pickWeighted(PRICE_OPTIONS, round2Weights(a.personality, ctx), rand);
}

// ============================================================================
//  Demo "humans": simulated participants for rehearsals and testing.
// ============================================================================

function demoRound1Weights(e: Economics): W {
  if (e.elasticity >= 2.0) return [0.35, 0.35, 0.20, 0.10, 0.00];
  if (e.elasticity >= 1.5) return [0.10, 0.25, 0.40, 0.20, 0.05];
  if (e.elasticity > 1.0) return [0.02, 0.10, 0.38, 0.35, 0.15];
  return [0.00, 0.05, 0.25, 0.35, 0.35];
}

export function demoRound1Decision(seed: string, playerId: string, e: Economics): Price {
  return pickWeighted(PRICE_OPTIONS, demoRound1Weights(e), rngFor(seed, 'demo', playerId, 'r1'));
}

/** Half of demo players "learn": they play a best response to Round 1. */
export function demoRound2Decision(seed: string, playerId: string, e: Economics, ctx: Round2Context): Price {
  const rand = rngFor(seed, 'demo', playerId, 'r2');
  if (rand() < 0.5) return pickWeighted(PRICE_OPTIONS, around(ctx.bestResponse, 0.1), rand);
  return pickWeighted(PRICE_OPTIONS, demoRound1Weights(e), rand);
}
