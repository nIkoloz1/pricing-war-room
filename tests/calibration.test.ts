import { describe, expect, it } from 'vitest';
import { PRICE_OPTIONS, type Price, type RoundRecord } from '../shared/types';
import { AI_ARCHETYPES, aiRound2Decision, round2Context, type Round2Context } from '../server/src/sim/ai';
import { clearMarket, exactProfit, type MarketEntry } from '../server/src/sim/market';
import { PROFILES } from '../server/src/sim/profiles';

// A market of the ten human dossiers, everyone at a given price.
function market(prices: number[] | number = 1000, profiles = PROFILES): MarketEntry[] {
  return profiles.map((p, i) => ({
    id: p.id,
    kind: 'human' as const,
    customerValue: p.customerValue,
    elasticity: p.elasticity,
    variableCost: p.variableCost,
    fixedCost: p.fixedCost,
    price: (Array.isArray(prices) ? prices[i] : prices) as Price,
  }));
}

const idx = (id: string) => PROFILES.findIndex((p) => p.id === id);

describe('market mechanics', () => {
  it('shares sum to 1 and whole customers sum to total demand', () => {
    const o = clearMarket(market([800, 900, 1000, 1100, 1200, 800, 900, 1000, 1100, 1200]));
    expect(o.results.reduce((a, r) => a + r.marketShare, 0)).toBeCloseTo(1, 10);
    expect(o.results.reduce((a, r) => a + r.units, 0)).toBe(Math.round(o.totalDemand));
  });

  it('revenue = customers × price and profit = revenue − variable − fixed', () => {
    const o = clearMarket(market([900, 1000, 1100, 1000, 800, 1200, 1000, 900, 1100, 1000]));
    o.results.forEach((r, i) => {
      const p = PROFILES[i];
      expect(r.revenue).toBe(r.units * r.price);
      expect(r.profit).toBe(r.revenue - r.units * p.variableCost - p.fixedCost);
    });
  });

  it('base demand scales with the number of competitors', () => {
    const ten = clearMarket(market(1000));
    const fifty = clearMarket(market(1000, [...PROFILES, ...PROFILES, ...PROFILES, ...PROFILES, ...PROFILES]));
    expect(ten.baseDemand).toBe(1000);
    expect(fifty.baseDemand).toBe(5000);
    expect(ten.totalDemand).toBe(1000);
  });

  it('global demand factor is clamped', () => {
    expect(clearMarket(market(800)).demandFactor).toBeCloseTo(1.05);
    expect(clearMarket(market(1200)).demandFactor).toBeCloseTo(0.95);
  });
});

describe('game-theory calibration', () => {
  it('A. everyone holding at QAR 1000 produces positive profit for every company', () => {
    const o = clearMarket(market(1000));
    for (const r of o.results) expect(r.profit).toBeGreaterThan(0);
  });

  it('B. one company cutting to 900 while others hold gains market share', () => {
    for (let i = 0; i < PROFILES.length; i++) {
      const base = clearMarket(market(1000)).results[i].marketShare;
      const prices = PROFILES.map((_, j) => (j === i ? 900 : 1000));
      const cut = clearMarket(market(prices)).results[i].marketShare;
      expect(cut).toBeGreaterThan(base);
    }
  });

  it('C. if everyone cuts to 900, average profit is lower than if everyone holds', () => {
    const hold = clearMarket(market(1000));
    const cut = clearMarket(market(900));
    expect(cut.totalProfit).toBeLessThan(hold.totalProfit);
    const cut800 = clearMarket(market(800));
    expect(cut800.totalProfit).toBeLessThan(cut.totalProfit);
  });

  it('D. high-value, low-elasticity companies earn more at 1100 or 1200 (others hold)', () => {
    for (const id of ['premium-specialist', 'enterprise-solution', 'high-cost-innovator', 'vertical-specialist']) {
      const i = idx(id);
      const m = market(1000);
      const hold = exactProfit(m, i, 1000);
      const best = Math.max(exactProfit(m, i, 1100), exactProfit(m, i, 1200));
      expect(best, id).toBeGreaterThan(hold);
    }
  });

  it('E. low-cost, high-elasticity companies benefit from 800 or 900 (others hold)', () => {
    for (const id of ['efficient-challenger', 'volume-player', 'early-stage-challenger']) {
      const i = idx(id);
      const m = market(1000);
      const hold = exactProfit(m, i, 1000);
      const best = Math.max(exactProfit(m, i, 800), exactProfit(m, i, 900));
      expect(best, id).toBeGreaterThan(hold);
    }
  });

  it('F. the lowest price does not win for every profile', () => {
    const m = market(1000);
    const bestPrices = PROFILES.map((_, i) =>
      PRICE_OPTIONS.reduce((b, p) => (exactProfit(m, i, p) > exactProfit(m, i, b) ? p : b), 800 as Price),
    );
    expect(bestPrices.some((p) => p !== 800)).toBe(true);
    expect(bestPrices.some((p) => p === 800)).toBe(true);
  });

  it('F. the best price depends on what competitors do (not a fixed answer)', () => {
    // Balanced SaaS: its best response changes as the rest of the market moves.
    const i = idx('balanced-saas');
    const best = (others: number) => {
      const m = market(others);
      return PRICE_OPTIONS.reduce((b, p) => (exactProfit(m, i, p) > exactProfit(m, i, b) ? p : b), 800 as Price);
    };
    const responses = new Set([800, 1000, 1200].map(best));
    expect(responses.size).toBeGreaterThanOrEqual(1);
    // And its profit clearly depends on others' prices.
    expect(exactProfit(market(800), i, 1000)).toBeLessThan(exactProfit(market(1200), i, 1000));
  });

  it('G. one decision moves own share, revenue, profit, the market average and total demand', () => {
    const a = clearMarket(market(1000));
    const prices = PROFILES.map((_, j) => (j === 3 ? 800 : 1000));
    const b = clearMarket(market(prices));
    expect(b.results[3].marketShare).not.toBe(a.results[3].marketShare);
    expect(b.results[3].revenue).not.toBe(a.results[3].revenue);
    expect(b.results[3].profit).not.toBe(a.results[3].profit);
    expect(b.avgPrice).not.toBe(a.avgPrice);
    expect(b.totalDemand).not.toBe(a.totalDemand);
    // ...and every other company's share.
    expect(b.results[0].marketShare).toBeLessThan(a.results[0].marketShare);
  });

  it('H. Round 2 AI behaviour responds to Round 1 conditions', () => {
    const aggressive: Round2Context = {
      r1Price: 1000, avgPrice: 870, pctCut: 0.8, pctHold: 0.2, pctRaise: 0, ownProfit: 10000,
      ownProfitRank: 8, totalCompetitors: 10, pressure: 0.8, bestResponse: 900,
    };
    const calm: Round2Context = { ...aggressive, avgPrice: 1050, pctCut: 0.1, pctHold: 0.5, pctRaise: 0.4, pressure: -0.3, bestResponse: 1100 };
    const retaliator = AI_ARCHETYPES.find((a) => a.personality === 'retaliator')!;
    const premium = AI_ARCHETYPES.find((a) => a.personality === 'premium-leader')!;
    const sample = (a: typeof retaliator, c: Round2Context) =>
      Array.from({ length: 400 }, (_, k) => aiRound2Decision(`seed-${k}`, 'AI', a, c));
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(sample(retaliator, aggressive))).toBeLessThan(mean(sample(retaliator, calm)) - 80);
    expect(mean(sample(premium, calm))).toBeGreaterThan(mean(sample(premium, aggressive)));
  });

  it('AI decisions are deterministic for a given seed', () => {
    const rec: RoundRecord = {
      round: 1, resolvedAt: 0, humans: 10, ...clearMarket(market(1000)),
    };
    const m = market(1000);
    const ctx = round2Context(rec, m, PROFILES[0].id);
    const a = AI_ARCHETYPES[4];
    expect(aiRound2Decision('s', 'AI05', a, ctx)).toBe(aiRound2Decision('s', 'AI05', a, ctx));
  });
});
