import type { MyRoundResult, PlayerView, PublicMarketInfo } from '../../../shared/types';
import { Delta } from '../ui/common';
import { MOVE, int, money, pct, qar } from '../lib';

export function ResultKpis({ r }: { r: MyRoundResult }) {
  return (
    <section className="kpis" aria-label={`Round ${r.round} headline results`}>
      <div className="kpi share">
        <span className="label">Your market share</span>
        <span className="value num">{pct(r.marketShare)}</span>
        <span className="sub">
          Rank {r.shareRank} of {r.totalCompetitors} competitors
        </span>
      </div>
      <div className="kpi revenue">
        <span className="label">Your revenue</span>
        <span className="value num">
          <span className="cur">QAR</span>
          {money(r.revenue)}
        </span>
        <span className="sub">
          {int(r.units)} customers × QAR {int(r.price)}
        </span>
      </div>
      <div className="kpi profit">
        <span className="label">Your profit</span>
        <span className={`value num${r.profit < 0 ? ' neg' : ''}`}>
          <span className="cur">QAR</span>
          {money(r.profit)}
        </span>
        <span className="sub">
          Rank {r.profitRank} of {r.totalCompetitors} · monthly operating profit
        </span>
      </div>
    </section>
  );
}

export function ResultDetails({ r }: { r: MyRoundResult }) {
  return (
    <div className="card pad stack">
      <div className="details">
        <div className="d">
          <span>Your price</span>
          <span>
            QAR {int(r.price)} · {MOVE[r.price].label}
            {r.defaulted ? ' (no decision, held)' : ''}
          </span>
        </div>
        <div className="d">
          <span>Customers acquired</span>
          <span>{int(r.units)}</span>
        </div>
        <div className="d">
          <span>Market average price</span>
          <span>QAR {int(r.avgPrice)}</span>
        </div>
        <div className="d">
          <span>Total market demand</span>
          <span>{int(r.totalDemand)} customers</span>
        </div>
        <div className="d">
          <span>Profit rank</span>
          <span>
            {r.profitRank} of {r.totalCompetitors}
          </span>
        </div>
        <div className="d">
          <span>Market share rank</span>
          <span>
            {r.shareRank} of {r.totalCompetitors}
          </span>
        </div>
      </div>
      <details className="fold" style={{ background: 'var(--ink-0)' }}>
        <summary>
          <span className="eyebrow">How your profit adds up</span>
        </summary>
        <div className="body pnl">
          <div className="l">
            <span>Revenue ({int(r.units)} × {int(r.price)})</span>
            <span>{money(r.revenue)}</span>
          </div>
          <div className="l">
            <span>− Variable costs</span>
            <span>{money(-r.variableCostTotal)}</span>
          </div>
          <div className="l">
            <span>− Fixed costs</span>
            <span>{money(-r.fixedCost)}</span>
          </div>
          <div className="l total">
            <span>= Profit</span>
            <span>{qar(r.profit)}</span>
          </div>
        </div>
      </details>
    </div>
  );
}

export function MarketIntel({ m, title }: { m: PublicMarketInfo; title: string }) {
  return (
    <section className="card pad moves" aria-label={title}>
      <div className="row between">
        <span className="eyebrow teal">{title}</span>
        <span className="eyebrow">Public</span>
      </div>
      <div className="minigrid">
        <div>
          <span className="k">Average price</span>
          <span className="v">QAR {int(m.avgPrice)}</span>
        </div>
        <div>
          <span className="k">Market demand</span>
          <span className="v">{int(m.totalDemand)}</span>
        </div>
      </div>
      <div className="movebar" role="img" aria-label={`${pct(m.pctCut, 0)} cut, ${pct(m.pctHold, 0)} held, ${pct(m.pctRaise, 0)} raised`}>
        {m.pctCut > 0 && <i className="c" style={{ width: `${m.pctCut * 100}%` }} />}
        {m.pctHold > 0 && <i className="h" style={{ width: `${m.pctHold * 100}%` }} />}
        {m.pctRaise > 0 && <i className="r" style={{ width: `${m.pctRaise * 100}%` }} />}
      </div>
      <div className="movelegend">
        <div>
          <span className="k">
            <i style={{ background: '#c4604f' }} /> Cut
          </span>
          <span className="v">{pct(m.pctCut, 0)}</span>
        </div>
        <div>
          <span className="k">
            <i style={{ background: '#7d8089' }} /> Held
          </span>
          <span className="v">{pct(m.pctHold, 0)}</span>
        </div>
        <div>
          <span className="k">
            <i style={{ background: 'var(--teal)' }} /> Raised
          </span>
          <span className="v">{pct(m.pctRaise, 0)}</span>
        </div>
      </div>
    </section>
  );
}

export function RoundOneRecap({ r }: { r: MyRoundResult }) {
  return (
    <section className="card pad stack" aria-label="Your Round 1">
      <span className="eyebrow brass">Your Round 1</span>
      <div className="minigrid">
        <div>
          <span className="k">Price</span>
          <span className="v">QAR {int(r.price)}</span>
        </div>
        <div>
          <span className="k">Market share</span>
          <span className="v">{pct(r.marketShare)}</span>
        </div>
        <div>
          <span className="k">Revenue · QAR</span>
          <span className="v">{money(r.revenue)}</span>
        </div>
        <div>
          <span className="k">Profit · QAR</span>
          <span className={`v${r.profit < 0 ? ' neg' : ''}`}>{money(r.profit)}</span>
        </div>
      </div>
    </section>
  );
}

export function ChangeTable({ a, b }: { a: MyRoundResult; b: MyRoundResult }) {
  const rows: { k: string; a: string; b: string; d: number; f: (n: number) => string }[] = [
    { k: 'Market share', a: pct(a.marketShare), b: pct(b.marketShare), d: (b.marketShare - a.marketShare) * 100, f: (n) => `${n.toFixed(1)} pts` },
    { k: 'Revenue', a: money(a.revenue), b: money(b.revenue), d: b.revenue - a.revenue, f: int },
    { k: 'Profit', a: money(a.profit), b: money(b.profit), d: b.profit - a.profit, f: int },
    { k: 'Price', a: int(a.price), b: int(b.price), d: b.price - a.price, f: int },
  ];
  return (
    <section className="card pad stack" aria-label="Your change from Round 1 to Round 2">
      <span className="eyebrow brass">Your change</span>
      <table className="change-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Round 1</th>
            <th scope="col">Round 2</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td>{r.k}</td>
              <td>{r.a}</td>
              <td style={{ fontWeight: 600 }}>{r.b}</td>
              <td>{r.k === 'Price' ? <span className="delta flat">{r.d === 0 ? 'same' : `${r.d > 0 ? '+' : '−'}${int(Math.abs(r.d))}`}</span> : <Delta value={r.d} format={r.f} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="faint" style={{ fontSize: 13 }}>Revenue and profit in QAR per month.</p>
    </section>
  );
}

export function ResultsScreen({ view, round }: { view: PlayerView; round: 1 | 2 }) {
  const r = view.me.results[round]!;
  const phase = view.session.phase;
  const r1 = view.me.results[1];
  return (
    <div className="stack-lg open-in">
      <header className="result-head">
        <span className="eyebrow brass">Round {round} result</span>
        <h1 className="display">{view.me.profile.company}</h1>
        <span className="faint">
          {view.me.codename} · {view.me.profile.archetype}
        </span>
      </header>

      <ResultKpis r={r} />

      {round === 2 && r1 && <ChangeTable a={r1} b={r} />}

      <ResultDetails r={r} />

      {round === 1 && (
        <div className="saved" role="status">
          <span aria-hidden="true" style={{ fontSize: 20 }}>
            ✓
          </span>
          <span>
            <b>Round 1 complete.</b> Your result is saved.
            {phase === 'workshop' ? ' The workshop is in progress. Round 2 opens when the host is ready.' : ' Waiting for the host.'}
          </span>
        </div>
      )}
      {round === 2 && (
        <div className="saved" role="status">
          <span aria-hidden="true" style={{ fontSize: 20 }}>
            ✓
          </span>
          <span>
            <b>Game complete.</b> {phase === 'debrief' ? 'Look up at the main screen for the market debrief.' : 'The debrief is about to begin.'}
          </span>
        </div>
      )}
    </div>
  );
}
