import type { CompetitorRow, FlowRow, MyRoundResult, PlayerView } from '../../../shared/types';
import { Delta, Similarity } from '../ui/common';
import { int, moveLabel, money, pct, pts, qar } from '../lib';

export function CompetitorBoard({ rows, highlightId, title = 'Your market' }: { rows: CompetitorRow[]; highlightId?: string; title?: string }) {
  return (
    <section className="card pad stack-sm" aria-label={title}>
      <div className="row between">
        <span className="eyebrow brass">{title}</span>
        <span className="eyebrow">By similarity</span>
      </div>
      <table className="board">
        <thead>
          <tr>
            <th scope="col">Competitor</th>
            <th scope="col" className="r">
              Similar
            </th>
            <th scope="col" className="r">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.id === highlightId ? 'pc' : undefined}>
              <td>
                <span className="co">{r.company}</span>
                <span className="seg">{r.segment}</span>
              </td>
              <td className="r">
                <Similarity value={r.similarity} />
              </td>
              <td className="r">
                <b>{int(r.price)}</b>
                <span className="mvtag">{moveLabel(r.price)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function FlowList({ flows, highlightId }: { flows: FlowRow[]; highlightId?: string }) {
  const max = Math.max(1, ...flows.map((f) => Math.abs(f.customers)));
  const moved = flows.filter((f) => f.customers !== 0 || f.id === highlightId);
  const still = flows.filter((f) => f.customers === 0 && f.id !== highlightId);
  return (
    <div className="flows" role="list">
      {moved.map((f) => {
        const kind = f.customers > 0 ? 'won' : f.customers < 0 ? 'lost' : 'even';
        const n = Math.abs(f.customers);
        return (
          <div key={f.id} role="listitem" className={`flow ${kind}${f.id === highlightId ? ' pc' : ''}`}>
            <span>
              {kind === 'won' ? (
                <>
                  Won <b>{n}</b> customer{n === 1 ? '' : 's'} from <b>{f.company}</b>
                </>
              ) : kind === 'lost' ? (
                <>
                  Lost <b>{n}</b> customer{n === 1 ? '' : 's'} to <b>{f.company}</b>
                </>
              ) : (
                <>
                  No customers moved with <b>{f.company}</b>
                </>
              )}
            </span>
            <span className="fv">
              {kind === 'won' ? '+' : kind === 'lost' ? '−' : ''}
              {n} · {Math.round(f.similarity * 100)}% similar
            </span>
            <span className="fbar" aria-hidden="true">
              <i style={{ width: `${(n / max) * 50}%` }} />
            </span>
          </div>
        );
      })}
      {still.length > 0 && (
        <div role="listitem" className="flow even">
          <span>
            No customers moved with <b>{still.map((f) => f.company).join(', ')}</b>
          </span>
        </div>
      )}
    </div>
  );
}

function Headline({ r }: { r: MyRoundResult }) {
  const profitable = r.profit >= 0;
  return (
    <section className="kpis" aria-label={`Round ${r.round} headline results`}>
      <div className="kpi profit">
        <span className="label">
          Your profit{' '}
          <span className={`badge ${profitable ? 'good' : 'bad'}`}>{profitable ? '✓ Profitable' : '✕ Loss'}</span>
        </span>
        <span className={`value num${profitable ? '' : ' neg'}`}>
          <span className="cur">QAR</span>
          {money(r.profit)}
        </span>
        <span className="sub">
          Rank {r.profitRank} of {r.marketSize} in your market · {qar(r.statusQuoProfit)} if everyone had held at 1,000
        </span>
      </div>
      <div className="kpi share">
        <span className="label">Market share change</span>
        <span className="value num">{pts(r.shareChangePp)}</span>
        <span className="sub">
          Start {pct(r.startShare)} → now {pct(r.share)} of your market
        </span>
      </div>
      <div className="kpi revenue">
        <span className="label">Customers</span>
        <span className="value num">{int(r.units)}</span>
        <span className="sub">
          Started with {int(r.startCustomers)} · revenue {qar(r.revenue)}
        </span>
      </div>
    </section>
  );
}

function Verdict({ r }: { r: MyRoundResult }) {
  const best = r.bestGivenCompetitors;
  const captured = best.profit > 0 ? Math.max(0, r.profit / best.profit) : null;
  return (
    <section className="card pad verdict" aria-label="How good was your price">
      <div className="vrow">
        <span>
          Your price
          <small>{r.defaulted ? 'No decision received, so your price stayed put' : moveLabel(r.price) === 'hold' ? 'Held at the going rate' : `${moveLabel(r.price)} vs the going rate`}</small>
        </span>
        <b>QAR {int(r.price)}</b>
      </div>
      <div className="vrow">
        <span>
          Your dossier right price
          <small>If every competitor had stayed at QAR 1,000</small>
        </span>
        <b>QAR {int(r.dossierRightPrice)}</b>
      </div>
      <div className="vrow">
        <span>
          Best price given what competitors actually did
          <small>Profit there: {qar(best.profit)}</small>
        </span>
        <b>QAR {int(best.price)}</b>
      </div>
      {captured !== null && (
        <div>
          <div className="row between" style={{ fontSize: 13.5 }}>
            <span className="muted">You captured</span>
            <b>{pct(Math.min(captured, 1), 0)} of the best possible profit</b>
          </div>
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${Math.min(1, captured) * 100}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

function PnL({ r }: { r: MyRoundResult }) {
  return (
    <details className="fold">
      <summary>
        <span className="eyebrow">How your profit adds up</span>
      </summary>
      <div className="body pnl">
        <div className="l">
          <span>
            Revenue ({int(r.units)} × {int(r.price)})
          </span>
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
  );
}

export function ChangeTable({ a, b }: { a: MyRoundResult; b: MyRoundResult }) {
  return (
    <section className="card pad stack" aria-label="Your change from Round 1 to Round 2">
      <span className="eyebrow brass">Round 1 → Round 2</span>
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
          <tr>
            <td>Profit</td>
            <td>{money(a.profit)}</td>
            <td style={{ fontWeight: 600 }}>{money(b.profit)}</td>
            <td>
              <Delta value={b.profit - a.profit} />
            </td>
          </tr>
          <tr>
            <td>Customers</td>
            <td>{int(a.units)}</td>
            <td style={{ fontWeight: 600 }}>{int(b.units)}</td>
            <td>
              <Delta value={b.units - a.units} />
            </td>
          </tr>
          <tr>
            <td>Share vs start</td>
            <td>{pts(a.shareChangePp)}</td>
            <td style={{ fontWeight: 600 }}>{pts(b.shareChangePp)}</td>
            <td>
              <Delta value={b.shareChangePp - a.shareChangePp} format={(n) => `${n.toFixed(1)} pts`} />
            </td>
          </tr>
          <tr>
            <td>Price</td>
            <td>{int(a.price)}</td>
            <td style={{ fontWeight: 600 }}>{int(b.price)}</td>
            <td>
              <span className="delta flat">{b.price === a.price ? 'same' : `${b.price > a.price ? '+' : '−'}${int(Math.abs(b.price - a.price))}`}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="faint" style={{ fontSize: 13 }}>
        Profit in QAR per month.
      </p>
    </section>
  );
}

function PrimaryRivalCard({ r }: { r: MyRoundResult }) {
  const pc = r.competitors.find((c) => c.id === r.primaryCompetitorId);
  const flow = r.flows?.find((f) => f.id === r.primaryCompetitorId);
  if (!pc || !flow) return null;
  return (
    <section className="card pad stack-sm" aria-label="Your primary competitor this round">
      <span className="eyebrow brass">Your primary competitor this round</span>
      <div className="row between">
        <span>
          <b style={{ fontSize: 18 }}>{pc.company}</b>
          <span className="faint" style={{ display: 'block', fontSize: 13 }}>
            {pc.segment} · {Math.round(pc.similarity * 100)}% similar
          </span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <b style={{ fontFamily: 'var(--f-display)', fontSize: 22 }}>QAR {int(pc.price)}</b>
          <span className="faint" style={{ display: 'block', fontSize: 13 }}>
            {flow.customers > 0 ? `you won ${flow.customers} from them` : flow.customers < 0 ? `they won ${-flow.customers} from you` : 'no customers moved'}
          </span>
        </span>
      </div>
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

      <Headline r={r} />
      {round === 2 && r1 && <ChangeTable a={r1} b={r} />}
      <Verdict r={r} />
      <PnL r={r} />

      {round === 2 && <PrimaryRivalCard r={r} />}
      {round === 2 && r.flows && (
        <section className="card pad stack-sm" aria-label="Where your customers came from and went">
          <span className="eyebrow brass">Customer flows this round</span>
          <FlowList flows={r.flows} highlightId={r.primaryCompetitorId} />
        </section>
      )}

      <CompetitorBoard rows={r.competitors} highlightId={round === 2 ? r.primaryCompetitorId : undefined} title={`Round ${round} prices`} />

      <div className="saved" role="status">
        <span aria-hidden="true" style={{ fontSize: 20 }}>
          ✓
        </span>
        <span>
          {round === 1 ? (
            <>
              <b>Round 1 complete.</b> Your result is saved.{' '}
              {phase === 'workshop' ? 'The workshop is in progress. Round 2 opens when the host is ready.' : 'Waiting for the host.'}
            </>
          ) : (
            <>
              <b>Game complete.</b> {phase === 'debrief' ? 'Look up at the main screen for the debrief.' : 'The debrief is about to begin.'}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
