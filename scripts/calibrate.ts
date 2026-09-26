// Prints the payoff landscape: each dossier's profit at every price when the
// rest of the market holds, cuts or raises. Run with: npm run calibrate
import { PRICE_OPTIONS, type Price } from '../shared/types';
import { clearMarket, exactProfit, type MarketEntry } from '../server/src/sim/market';
import { PROFILES } from '../server/src/sim/profiles';

const market = (others: number): MarketEntry[] =>
  PROFILES.map((p) => ({ ...p, id: p.id, kind: 'human' as const, price: others as Price }));

const fmt = (n: number) => Math.round(n).toLocaleString('en-US').padStart(8);

for (const others of [900, 1000, 1100]) {
  console.log(`\nProfit by own price, everyone else at QAR ${others}`);
  console.log('Dossier'.padEnd(26) + PRICE_OPTIONS.map((p) => String(p).padStart(8)).join('') + '   best');
  PROFILES.forEach((p, i) => {
    const m = market(others);
    const vals = PRICE_OPTIONS.map((pr) => exactProfit(m, i, pr));
    const best = PRICE_OPTIONS[vals.indexOf(Math.max(...vals))];
    console.log(`${p.dossier} ${p.archetype}`.padEnd(26) + vals.map(fmt).join('') + `   ${best}`);
  });
}

console.log('\nWhole-market scenarios (10 dossiers)');
for (const price of PRICE_OPTIONS) {
  const o = clearMarket(market(price));
  console.log(`All at ${price}: demand ${o.totalDemand.toFixed(0)}  revenue ${fmt(o.totalRevenue)}  profit ${fmt(o.totalProfit)}  avg ${fmt(o.totalProfit / 10)}`);
}
