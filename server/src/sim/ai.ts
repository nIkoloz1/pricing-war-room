import type { Letter, Price } from '../../../shared/types';
import { COMPANY_BY_LETTER, type Personality } from './companies';
import { pickWeighted, rngFor, snap } from './market';
import { REFERENCE_PRICE } from './params';

// ============================================================================
//  AI competitors fill the archetypes no human plays in a market. They use the
//  archetype's exact economics and a personality. Deterministic given the seed,
//  and deliberately imperfect.
// ============================================================================

function round1Options(p: Personality, R: number): { prices: number[]; weights: number[] } {
  const eq = (prices: number[]) => ({ prices, weights: prices.map(() => 1) });
  switch (p) {
    case 'premium-leader': return eq([R, R + 50, R + 100]);
    case 'aggressive-challenger': return eq([R - 50, R - 100, R - 150]);
    case 'stable-operator': return { prices: [REFERENCE_PRICE, R], weights: [0.7, 0.3] };
    case 'value-specialist': return eq([R, R + 50]);
    case 'low-cost': return eq([R - 50, R - 100]);
    case 'retaliator': return { prices: [REFERENCE_PRICE, R], weights: [0.5, 0.5] };
    case 'market-follower': return { prices: [REFERENCE_PRICE, R], weights: [0.7, 0.3] };
    case 'growth-seeker': return eq([R - 100, R - 150]);
    case 'margin-defender': return eq([R, R + 50]);
    case 'adaptive': return eq([R]);
  }
}

export function aiRound1Decision(seed: string, aiId: string, letter: Letter): Price {
  const c = COMPANY_BY_LETTER[letter];
  const { prices, weights } = round1Options(c.personality, c.rightPrice);
  return snap(pickWeighted(prices, weights, rngFor(seed, 'ai', aiId, 'r1')));
}

export interface Round2Context {
  r1Price: Price;
  /** best response to the Round 1 market (everyone else at their R1 prices) */
  bestResponse: Price;
  /** Round 1 price of its primary competitor */
  pcPrice: Price;
  /** Round 1 profit ÷ best-response profit */
  captured: number | null;
}

export function aiRound2Decision(seed: string, aiId: string, letter: Letter, ctx: Round2Context): Price {
  const rand = rngFor(seed, 'ai', aiId, 'r2');
  const { bestResponse: br, r1Price, pcPrice, captured } = ctx;
  switch (COMPANY_BY_LETTER[letter].personality) {
    case 'adaptive':
      return br;
    case 'retaliator':
      return pcPrice < r1Price ? snap(pcPrice) : br;
    case 'market-follower':
      return snap(r1Price + (pcPrice - r1Price) / 2);
    case 'aggressive-challenger':
    case 'growth-seeker':
    case 'low-cost':
      return snap(br - 50);
    case 'premium-leader':
    case 'value-specialist':
    case 'margin-defender':
      return snap(rand() < 0.5 ? br : br + 50);
    case 'stable-operator':
      return captured !== null && captured < 0.9 ? br : r1Price;
  }
}

// ============================================================================
//  Demo "humans": simulated participants for rehearsals and testing.
// ============================================================================

export function demoRound1Decision(seed: string, playerId: string, letter: Letter): Price {
  const rand = rngFor(seed, 'demo', playerId, 'r1');
  const R = COMPANY_BY_LETTER[letter].rightPrice;
  const r = rand();
  if (r < 0.45) return snap(R);
  if (r < 0.65) return REFERENCE_PRICE;
  const offset = [100, 150, 200][Math.floor(rand() * 3)];
  return snap(R + (rand() < 0.5 ? -offset : offset));
}

export function demoRound2Decision(seed: string, playerId: string, ctx: Round2Context): Price {
  const r = rngFor(seed, 'demo', playerId, 'r2')();
  if (r < 0.5) return ctx.bestResponse;
  if (r < 0.75) return ctx.r1Price;
  return snap(ctx.r1Price + (ctx.pcPrice - ctx.r1Price) / 2);
}

/** Demo players identify their primary competitor correctly 60% of the time. */
export function demoGuess(seed: string, playerId: string, optionIds: string[], correctId: string): string {
  const rand = rngFor(seed, 'demo', playerId, 'guess');
  if (rand() < 0.6) return correctId;
  const wrong = optionIds.filter((id) => id !== correctId);
  return wrong.length ? wrong[Math.floor(rand() * wrong.length)] : correctId;
}
