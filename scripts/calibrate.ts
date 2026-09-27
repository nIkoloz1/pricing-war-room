// Prints the engine's landscape for rehearsal and re-tuning: derived coefficients,
// best responses, the similarity matrix and whole-market scenarios.
// Run with: npm run calibrate
import type { Letter } from '../shared/types';
import { COMPANIES } from '../server/src/sim/companies';
import { COEF, bestResponse, clearMarket, exactProfit, similarity, statusQuoProfit, type MarketEntry } from '../server/src/sim/market';

const LETTERS = COMPANIES.map((c) => c.letter);
const market = (price: (l: Letter) => number): MarketEntry[] =>
  COMPANIES.map((c) => ({ id: c.letter, kind: 'ai' as const, letter: c.letter, company: c.company, price: price(c.letter) }));
const fmt = (n: number, w = 8) => Math.round(n).toLocaleString('en-US').padStart(w);
const right = (l: Letter) => COMPANIES.find((c) => c.letter === l)!.rightPrice;

console.log('\nCompany                      T       b       C   switch  maxWTP  right  statusQuo  @right   BR|all@1000  BR|all@right');
for (const c of COMPANIES) {
  const k = COEF[c.letter];
  const i = LETTERS.indexOf(c.letter);
  console.log(
    `${c.letter} ${c.company.padEnd(24)} ${k.T.toFixed(4)} ${k.b.toFixed(4)} ${k.C.toFixed(4)} ${(k.switchShare * 100).toFixed(0).padStart(5)}% ${fmt(k.maxWtp, 7)} ${fmt(c.rightPrice, 6)} ${fmt(statusQuoProfit(c.letter), 10)} ${fmt(exactProfit(market(() => 1000), i, c.rightPrice), 7)} ${String(bestResponse(market(() => 1000), i)).padStart(12)} ${String(bestResponse(market(right), i)).padStart(13)}`,
  );
}

console.log('\nSimilarity (%)');
console.log('   ' + LETTERS.map((l) => l.padStart(4)).join(''));
for (const a of LETTERS) console.log(`${a}  ` + LETTERS.map((b) => (a === b ? '   ·' : String(Math.round(similarity(a, b) * 100)).padStart(4))).join(''));

console.log('\nWhole-market scenarios (one market of 10)');
const scen: [string, (l: Letter) => number][] = [
  ['Everyone at 1,000', () => 1000],
  ['Everyone at right price', right],
  ['Right, SMB (B,F,J) cut 100', (l) => (['B', 'F', 'J'].includes(l) ? right(l) - 100 : right(l))],
  ['Everyone cuts 100 from right', (l) => Math.max(700, right(l) - 100)],
];
for (const [label, f] of scen) {
  const o = clearMarket(market(f));
  console.log(`${label.padEnd(30)} customers ${fmt(o.totalUnits, 5)}  revenue ${fmt(o.totalRevenue, 10)}  profit ${fmt(o.totalProfit, 9)}`);
}
