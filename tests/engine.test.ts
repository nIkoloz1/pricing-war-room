import { describe, expect, it } from 'vitest';
import type { Letter } from '../shared/types';
import { COMPANIES, COMPANY_BY_LETTER } from '../server/src/sim/companies';
import {
  COEF,
  bestResponse,
  clearMarket,
  dossierCustomers,
  exactProfit,
  flowsFor,
  primaryCompetitor,
  similarity,
  statusQuoProfit,
  type MarketEntry,
} from '../server/src/sim/market';
import { PROFILE_BY_LETTER } from '../server/src/sim/profiles';

const LETTERS = COMPANIES.map((c) => c.letter);

/** A standard market: one company per archetype; prices by letter, default = right price. */
function market(prices: Partial<Record<Letter, number>> = {}, base: 'right' | number = 'right'): MarketEntry[] {
  return COMPANIES.map((c) => ({
    id: c.letter,
    kind: 'ai' as const,
    letter: c.letter,
    company: c.company,
    price: prices[c.letter] ?? (base === 'right' ? c.rightPrice : base),
  }));
}
const at = (l: Letter) => LETTERS.indexOf(l);

describe('derived coefficients', () => {
  const expected: Record<Letter, [number, number, number, number, number, number, number]> = {
    //    T        b        C      switch maxWtp  statusQuo  atRight
    A: [0.11275, 0.07415, 0.0386, 0.34, 2020, 36300, 40810],
    B: [0.22917, 0.02924, 0.19993, 0.87, 1480, 60800, 65956],
    C: [0.13426, 0.08348, 0.05078, 0.38, 2080, 42100, 50491],
    D: [0.17742, 0.04994, 0.12748, 0.72, 1620, 49200, 49644],
    E: [0.14667, 0.06232, 0.08435, 0.58, 1750, 33500, 33867],
    F: [0.3125, 0.12984, 0.18266, 0.58, 1400, 78000, 90500],
    G: [0.05839, 0.0494, 0.009, 0.15, 2370, 21600, 28753],
    H: [0.19608, 0.06333, 0.13275, 0.68, 1510, 43000, 44961],
    I: [0.08261, 0.04094, 0.04167, 0.5, 2150, 12250, 19685],
    J: [0.16304, 0.02673, 0.13631, 0.84, 1460, 37000, 40668],
  };

  for (const l of LETTERS) {
    it(`${l}: T, b, C, switch share, max WTP, status quo and right-price profit`, () => {
      const [t, b, c, sw, wtp, sq, right] = expected[l];
      const k = COEF[l];
      expect(Math.abs(k.T - t)).toBeLessThan(0.001);
      expect(Math.abs(k.b - b)).toBeLessThan(0.001);
      expect(Math.abs(k.C - c)).toBeLessThan(0.001);
      expect(Math.round(k.switchShare * 100)).toBe(Math.round(sw * 100));
      expect(Math.abs(k.maxWtp - wtp)).toBeLessThanOrEqual(1);
      expect(k.b).toBeGreaterThan(0);
      // max WTP = 2R − VC, so the right price sits halfway between max WTP and VC
      expect(k.maxWtp).toBeCloseTo(2 * COMPANY_BY_LETTER[l].rightPrice - COMPANY_BY_LETTER[l].vc, 6);
      const m = market({}, 1000);
      expect(Math.abs(exactProfit(m, at(l), 1000) - sq)).toBeLessThanOrEqual(1);
      expect(statusQuoProfit(l)).toBe(sq);
      expect(Math.abs(exactProfit(m, at(l), COMPANY_BY_LETTER[l].rightPrice) - right)).toBeLessThanOrEqual(1);
    });
  }

  it('start shares', () => {
    const o = clearMarket(market({}, 1000));
    const s = Object.fromEntries(o.results.map((r) => [r.letter, Math.round(r.startShare * 1000) / 10]));
    expect(s).toEqual({ A: 10.8, B: 10.3, C: 13.6, D: 10.3, E: 10.3, F: 11.7, G: 7.5, H: 9.4, I: 8.9, J: 7.0 });
  });

  it('status quo (everyone at 1,000) gives exactly the starting customers and zero share change', () => {
    const o = clearMarket(market({}, 1000));
    for (const r of o.results) {
      expect(r.exactUnits).toBeCloseTo(COMPANY_BY_LETTER[r.letter].startCustomers, 9);
      expect(r.shareChangePp).toBeCloseTo(0, 9);
      expect(r.profit).toBe(r.statusQuoProfit);
    }
  });

  it('similarities', () => {
    const s = (a: Letter, b: Letter) => Math.round(similarity(a, b) * 100);
    expect([s('F', 'B'), s('B', 'J'), s('F', 'J'), s('D', 'H'), s('E', 'C'), s('A', 'I'), s('E', 'I'), s('D', 'E'), s('B', 'H')]).toEqual([
      57, 52, 37, 46, 23, 23, 22, 20, 20,
    ]);
    const g = LETTERS.filter((l) => l !== 'G').map((l) => similarity('G', l));
    expect(Math.max(...g)).toBeLessThanOrEqual(0.065);
    expect(Math.max(...g)).toBe(similarity('G', 'A'));
    expect(similarity('A', 'B')).toBe(similarity('B', 'A'));
  });

  it('dossier demand table', () => {
    expect(dossierCustomers('A', 1200)).toBe(92);
    expect(dossierCustomers('F', 800)).toBe(188);
    expect(dossierCustomers('G', 1350)).toBe(60);
    expect(dossierCustomers('J', 1450)).toBe(2);
    expect(dossierCustomers('F', 1400)).toBe(0);
    expect(PROFILE_BY_LETTER.A.demandTable).toHaveLength(16);
  });
});

describe('engine behaviour', () => {
  it('best response with all others at 1,000 is the dossier right price', () => {
    const m = market({}, 1000);
    for (const l of LETTERS) expect(bestResponse(m, at(l)), l).toBe(COMPANY_BY_LETTER[l].rightPrice);
  });

  it('SwiftOps (B) reacts to ScaleAI (F)', () => {
    const br = (f: number) => bestResponse(market({ F: f }), at('B'));
    expect([br(700), br(1000), br(1300)]).toEqual([750, 850, 900]);
  });

  it('NexaFlow (D) reacts to CoreOps (H)', () => {
    const br = (h: number) => bestResponse(market({ H: h }), at('D'));
    expect([br(700), br(1000), br(1300)]).toEqual([900, 950, 1000]);
  });

  it('MedFlow (G) ignores Lumina (A): differentiated', () => {
    const br = (a: number) => bestResponse(market({ A: a }), at('G'));
    expect([br(700), br(1000), br(1300)]).toEqual([1350, 1350, 1350]);
  });

  it('best responses when everyone else plays their right price', () => {
    const m = market();
    const got = Object.fromEntries(LETTERS.map((l) => [l, bestResponse(m, at(l))]));
    expect(got).toEqual({ A: 1200, B: 800, C: 1250, D: 950, E: 1100, F: 750, G: 1350, H: 900, I: 1350, J: 800 });
  });

  it("prisoner's dilemma in the SMB cluster (B, F, J)", () => {
    const right = market();
    const cut = market({ B: 750, F: 700, J: 750 });
    const p = (m: MarketEntry[], l: Letter) => exactProfit(m, at(l), m[at(l)].price);
    expect(Math.abs(p(right, 'B') - 47429)).toBeLessThanOrEqual(1);
    expect(Math.abs(p(right, 'F') - 76547)).toBeLessThanOrEqual(1);
    expect(Math.abs(p(right, 'J') - 28564)).toBeLessThanOrEqual(1);
    expect(Math.abs(p(cut, 'B') - 40051)).toBeLessThanOrEqual(1);
    expect(Math.abs(p(cut, 'F') - 68661)).toBeLessThanOrEqual(1);
    expect(Math.abs(p(cut, 'J') - 23287)).toBeLessThanOrEqual(1);
  });

  it('flows are antisymmetric and sum to zero across a market', () => {
    const m = market({ A: 1450, B: 700, D: 1100, F: 750, G: 900, J: 1300 });
    let total = 0;
    m.forEach((_, j) => {
      for (const f of flowsFor(m, j)) {
        const back = flowsFor(m, at(f.letter)).find((x) => x.letter === m[j].letter)!;
        expect(f.flow).toBeCloseTo(-back.flow, 9);
        total += f.flow;
      }
    });
    expect(total).toBeCloseTo(0, 9);
  });

  it('primary competitor: largest flow, or most similar when flows are tiny', () => {
    const calm = market({}, 1000);
    expect(primaryCompetitor(calm, at('B'))).toBe('F'); // B's most similar
    const m = market({}, 1000);
    m[at('J')].price = 700; // J undercuts heavily; B loses the most to J
    expect(primaryCompetitor(m, at('B'))).toBe('J');
  });

  it('clearing: revenue = customers × price, profit = revenue − variable − fixed', () => {
    const o = clearMarket(market({ A: 1450, B: 700, C: 900, H: 1300 }));
    for (const r of o.results) {
      const c = COMPANY_BY_LETTER[r.letter];
      expect(r.units).toBe(Math.round(r.exactUnits));
      expect(r.revenue).toBe(r.units * r.price);
      expect(r.profit).toBe(r.units * (r.price - c.vc) - c.fc);
      expect(r.shareChangePp).toBeCloseTo((r.share - r.startShare) * 100, 9);
    }
    expect(o.results.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 9);
  });
});
