import { useState } from 'react';
import type { Debrief as DebriefData, HostView, RoundNo } from '../../../shared/types';
import { int, kqar, pct, qar } from '../lib';
import { Delta } from '../ui/common';
import { CounterfactualBars, PriceDistribution } from './charts';

function Section({ n, title, children, aside }: { n: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="card pad">
      <div className="section-title">
        <div className="row" style={{ gap: 14 }}>
          <span className="num-badge">{n}</span>
          <h2>{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

type Row = { k: string; a?: number; b?: number; f: (n: number) => string; df?: (n: number) => string; neutral?: boolean };

function CompareTable({ rows, hasR2 }: { rows: Row[]; hasR2: boolean }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Metric</th>
          <th className="r">Round 1</th>
          {hasR2 && <th className="r">Round 2</th>}
          {hasR2 && <th className="r">Change</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.k}>
            <td>{r.k}</td>
            <td className="r">{r.a !== undefined ? r.f(r.a) : '·'}</td>
            {hasR2 && <td className="r strong">{r.b !== undefined ? r.f(r.b) : '·'}</td>}
            {hasR2 && (
              <td className="r">{r.a !== undefined && r.b !== undefined ? <Delta value={r.b - r.a} format={r.df ?? r.f} neutral={r.neutral} /> : '·'}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RoundSummary({ view, round }: { view: HostView; round: RoundNo }) {
  const d = view.debrief?.rounds[round];
  const rec = view.rounds[round];
  if (!d || !rec) return null;
  return (
    <section className="card pad stack">
      <div className="section-title" style={{ marginBottom: 0 }}>
        <h2>Round {round} · market cleared</h2>
        <span className="eyebrow">{rec.totalCompetitors} competitors · {rec.humans} human</span>
      </div>
      <div className="stats">
        <div className="card stat">
          <span className="k">Average price</span>
          <span className="v">{int(d.avgPrice)}</span>
          <span className="s">QAR / month</span>
        </div>
        <div className="card stat">
          <span className="k">Market demand</span>
          <span className="v">{int(d.totalDemand)}</span>
          <span className="s">customers (factor {rec.demandFactor.toFixed(3)})</span>
        </div>
        <div className="card stat">
          <span className="k">Total market profit</span>
          <span className="v">{kqar(d.totalProfit)}</span>
          <span className="s">avg {qar(d.avgProfit)} per company</span>
        </div>
        <div className="card stat">
          <span className="k">Cut · Hold · Raise</span>
          <span className="v">
            {d.moves.cut}·{d.moves.hold}·{d.moves.raise}
          </span>
          <span className="s">
            {pct(d.moves.pctCut, 0)} cut · {pct(d.moves.pctHold, 0)} held · {pct(d.moves.pctRaise, 0)} raised
          </span>
        </div>
      </div>
      <PriceDistribution
        r1={round === 1 ? d.priceHistogram : view.debrief?.rounds[1]?.priceHistogram}
        r2={round === 2 ? d.priceHistogram : undefined}
      />
    </section>
  );
}

export function Debrief({ view }: { view: HostView }) {
  const d = view.debrief as DebriefData;
  const [showNames, setShowNames] = useState(false);
  const a = d.rounds[1];
  const b = d.rounds[2];
  const hasR2 = !!b;
  const hold = d.counterfactuals.find((c) => c.key === 'hold');
  const cut = d.counterfactuals.find((c) => c.key === 'cut');
  const actual = d.counterfactuals.find((c) => c.key === (hasR2 ? 'actual2' : 'actual1'));
  const L = d.learning;
  const lb = [...d.leaderboard].sort((x, y) => (y.r2Profit ?? y.r1Profit ?? 0) - (x.r2Profit ?? x.r1Profit ?? 0));

  return (
    <div className="stack-lg">
      <Section n="01" title="Room behavior" aside={<span className="eyebrow">All competitors · humans + AI</span>}>
        <CompareTable
          hasR2={hasR2}
          rows={[
            { k: 'Average price (QAR)', a: a?.avgPrice, b: b?.avgPrice, f: int, neutral: true },
            { k: 'Average profit (QAR)', a: a?.avgProfit, b: b?.avgProfit, f: int },
            { k: 'Average revenue (QAR)', a: a?.avgRevenue, b: b?.avgRevenue, f: int },
            { k: 'Average participant market share', a: a?.avgShare, b: b?.avgShare, f: (n) => pct(n), df: (n) => `${(n * 100).toFixed(1)} pts`, neutral: true },
            { k: 'Cutting', a: a?.moves.pctCut, b: b?.moves.pctCut, f: (n) => pct(n, 0), df: (n) => `${Math.round(n * 100)} pts`, neutral: true },
            { k: 'Holding', a: a?.moves.pctHold, b: b?.moves.pctHold, f: (n) => pct(n, 0), df: (n) => `${Math.round(n * 100)} pts`, neutral: true },
            { k: 'Raising', a: a?.moves.pctRaise, b: b?.moves.pctRaise, f: (n) => pct(n, 0), df: (n) => `${Math.round(n * 100)} pts`, neutral: true },
          ]}
        />
      </Section>

      <Section n="02" title="Market outcome">
        <CompareTable
          hasR2={hasR2}
          rows={[
            { k: 'Total market demand (customers)', a: a?.totalDemand, b: b?.totalDemand, f: int, neutral: true },
            { k: 'Total market revenue (QAR)', a: a?.totalRevenue, b: b?.totalRevenue, f: int },
            { k: 'Total market profit (QAR)', a: a?.totalProfit, b: b?.totalProfit, f: int },
          ]}
        />
      </Section>

      <Section n="03" title="Counterfactuals: what if everyone moved together?" aside={<span className="eyebrow">Same companies, same economics</span>}>
        <div className="stack">
          {hold && cut && actual && (
            <p className="callout">
              If every company had simply <b>held at QAR 1,000</b>, the market would have earned{' '}
              <b>{qar(Math.abs(hold.totalProfit - actual.totalProfit))}</b> {hold.totalProfit >= actual.totalProfit ? 'more' : 'less'} than it
              actually did. If everyone had cut to QAR 900, total profit would fall to <b>{qar(cut.totalProfit)}</b>.
            </p>
          )}
          <CounterfactualBars items={d.counterfactuals} />
          <table className="data">
            <thead>
              <tr>
                <th>Scenario</th>
                <th className="r">Avg price</th>
                <th className="r">Total demand</th>
                <th className="r">Total revenue</th>
                <th className="r">Total profit</th>
                <th className="r">Avg profit / company</th>
              </tr>
            </thead>
            <tbody>
              {d.counterfactuals.map((c) => (
                <tr key={c.key} className={c.key.startsWith('actual') ? 'hl' : ''}>
                  <td className={c.key.startsWith('actual') ? 'strong' : ''}>{c.label}</td>
                  <td className="r">{int(c.avgPrice)}</td>
                  <td className="r">{int(c.totalDemand)}</td>
                  <td className="r">{int(c.totalRevenue)}</td>
                  <td className="r strong">{int(c.totalProfit)}</td>
                  <td className="r">{int(c.avgProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="h-grid">
        <Section n="04" title="Strategic behavior">
          <div className="stack">
            <PriceDistribution r1={a?.priceHistogram} r2={b?.priceHistogram} />
            <table className="data">
              <thead>
                <tr>
                  <th>Move</th>
                  <th className="r">Round 1</th>
                  {hasR2 && <th className="r">Round 2</th>}
                </tr>
              </thead>
              <tbody>
                {(['cut', 'hold', 'raise'] as const).map((k) => (
                  <tr key={k}>
                    <td style={{ textTransform: 'capitalize' }}>{k === 'hold' ? 'Held' : k === 'cut' ? 'Cut' : 'Raised'}</td>
                    <td className="r">{a?.moves[k] ?? '·'}</td>
                    {hasR2 && <td className="r strong">{b?.moves[k]}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section n="05" title="Learning effect" aside={<span className="eyebrow">{L.humans} participants</span>}>
          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card stat">
              <span className="k">Avg profit R1 → R2</span>
              <span className="v" style={{ fontSize: 28 }}>
                {L.avgProfitR1 !== null ? int(L.avgProfitR1) : '·'} → {L.avgProfitR2 !== null ? int(L.avgProfitR2) : '·'}
              </span>
              {L.avgProfitR1 !== null && L.avgProfitR2 !== null && <Delta value={L.avgProfitR2 - L.avgProfitR1} format={(n) => `QAR ${int(n)}`} />}
            </div>
            <div className="card stat">
              <span className="k">Avg price R1 → R2</span>
              <span className="v" style={{ fontSize: 28 }}>
                {L.avgPriceR1 !== null ? int(L.avgPriceR1) : '·'} → {L.avgPriceR2 !== null ? int(L.avgPriceR2) : '·'}
              </span>
              <span className="s">QAR / month, participants only</span>
            </div>
            <div className="card stat">
              <span className="k">Changed price</span>
              <span className="v">{L.pctChanged !== null ? pct(L.pctChanged, 0) : '·'}</span>
            </div>
            <div className="card stat">
              <span className="k">Moved up · down</span>
              <span className="v" style={{ fontSize: 30 }}>
                {L.pctUp !== null ? `▲ ${pct(L.pctUp, 0)}` : '·'}{'  '}
                {L.pctDown !== null ? `▼ ${pct(L.pctDown, 0)}` : ''}
              </span>
            </div>
          </div>
        </Section>
      </div>

      <Section
        n="06"
        title="Leaderboard"
        aside={
          <label className="toggle">
            <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Show names
          </label>
        }
      >
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Competitor</th>
              <th>Archetype</th>
              <th className="r">R1 price</th>
              <th className="r">R1 profit</th>
              {hasR2 && <th className="r">R2 price</th>}
              {hasR2 && <th className="r">R2 profit</th>}
            </tr>
          </thead>
          <tbody>
            {lb.slice(0, 15).map((r, i) => (
              <tr key={r.id}>
                <td className="faint">{i + 1}</td>
                <td>
                  {r.kind === 'ai' ? r.label : showNames ? r.label : r.label.split(' · ')[0]}{' '}
                  {r.kind === 'ai' && <span className="tag ai">AI</span>}
                </td>
                <td className="muted">{r.archetype}</td>
                <td className="r">{r.r1Price ?? '·'}</td>
                <td className="r">{r.r1Profit !== null ? int(r.r1Profit) : '·'}</td>
                {hasR2 && <td className="r">{r.r2Price ?? '·'}</td>}
                {hasR2 && <td className="r strong">{r.r2Profit !== null ? int(r.r2Profit) : '·'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
