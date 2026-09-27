import { useState } from 'react';
import type { HostView, LeaderRow, RoundNo } from '../../../shared/types';
import { int, kqar, pct, pts, qar } from '../lib';
import { Delta } from '../ui/common';
import { Icon } from '../ui/icons';
import { CounterfactualBars, PriceDistribution, QuadrantScatter } from './charts';

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

function Tile({ k, v, s }: { k: string; v: React.ReactNode; s?: React.ReactNode }) {
  return (
    <div className="card stat">
      <span className="k">{k}</span>
      <span className="v" style={{ fontSize: 34 }}>
        {v}
      </span>
      {s && <span className="s">{s}</span>}
    </div>
  );
}

const orDot = (x: number | null, f: (n: number) => string) => (x === null ? '·' : f(x));

/** Shown while a round's results are on screen. */
export function RoundSummary({ view, round }: { view: HostView; round: RoundNo }) {
  const d = view.debrief?.rounds[round];
  const rec = view.rounds[round];
  const st = view.debrief?.stats;
  if (!d || !rec || !st) return null;
  return (
    <section className="card pad stack">
      <div className="section-title" style={{ marginBottom: 0 }}>
        <h2>Round {round} · markets cleared</h2>
        <span className="eyebrow">
          {rec.markets.length} market{rec.markets.length === 1 ? '' : 's'} · {rec.totalCompetitors} companies · {rec.humans} human
        </span>
      </div>
      <div className="stats">
        <Tile k="Average price" v={int(d.avgPrice)} s="QAR / month, all companies" />
        <Tile k="Total profit" v={kqar(d.totalProfit)} s={`avg ${qar(d.avgProfit)} per company`} />
        {round === 1 ? (
          <Tile k="At dossier right price" v={orDot(st.pctAtRightR1, (x) => pct(x, 0))} s={`within ±50: ${orDot(st.pctNearRightR1, (x) => pct(x, 0))} of participants`} />
        ) : (
          <Tile k="Named primary competitor" v={orDot(st.pctGuessCorrect, (x) => pct(x, 0))} s={`${st.guesses} answers`} />
        )}
        <Tile k="Cut · Hold · Raise" v={`${d.moves.cut}·${d.moves.hold}·${d.moves.raise}`} s="vs QAR 1,000" />
      </div>
      <PriceDistribution r1={round === 1 ? d.priceHistogram : view.debrief?.rounds[1]?.priceHistogram} r2={round === 2 ? d.priceHistogram : undefined} />
    </section>
  );
}

type SortKey = 'r2Profit' | 'r1Profit' | 'r1SharePp' | 'r2SharePp';

function Leaderboard({ rows, hasR2 }: { rows: LeaderRow[]; hasR2: boolean }) {
  const [sort, setSort] = useState<SortKey>(hasR2 ? 'r2Profit' : 'r1Profit');
  const [showNames, setShowNames] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const shown = rows
    .filter((r) => showAi || r.kind === 'human')
    .sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));
  const th = (key: SortKey, label: string) => (
    <th
      className="r sortable"
      aria-sort={sort === key ? 'descending' : 'none'}
      tabIndex={0}
      onClick={() => setSort(key)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSort(key)}
    >
      {label}
    </th>
  );
  return (
    <div className="stack-sm">
      <div className="row" style={{ gap: 20 }}>
        <label className="toggle">
          <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Show names
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showAi} onChange={(e) => setShowAi(e.target.checked)} /> Include AI
        </label>
        <span className="faint" style={{ fontSize: 13 }}>
          Click a profit or share column to sort.
        </span>
      </div>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Company</th>
              <th>Mkt</th>
              <th className="r">R1 price</th>
              {hasR2 && <th className="r">R2 price</th>}
              {th('r1Profit', 'R1 profit')}
              {hasR2 && th('r2Profit', 'R2 profit')}
              {th('r1SharePp', 'R1 share')}
              {hasR2 && th('r2SharePp', 'R2 share')}
              {hasR2 && <th className="r">Quiz</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id} className={r.kind === 'ai' ? 'ai' : undefined}>
                <td className="faint">{i + 1}</td>
                <td>{r.kind === 'ai' ? <span className="tag ai">AI</span> : showNames ? r.player : r.player?.split(' · ')[0]}</td>
                <td>
                  {r.company} <span className="faint">({r.letter})</span>
                </td>
                <td>
                  <span className="mkt">M{r.market + 1}</span>
                </td>
                <td className="r">{r.r1Price ?? '·'}</td>
                {hasR2 && <td className="r">{r.r2Price ?? '·'}</td>}
                <td className={`r${sort === 'r1Profit' ? ' strong' : ''}`}>{r.r1Profit !== null ? int(r.r1Profit) : '·'}</td>
                {hasR2 && <td className={`r${sort === 'r2Profit' ? ' strong' : ''}`}>{r.r2Profit !== null ? int(r.r2Profit) : '·'}</td>}
                <td className={`r${sort === 'r1SharePp' ? ' strong' : ''}`}>{r.r1SharePp !== null ? pts(r.r1SharePp) : '·'}</td>
                {hasR2 && <td className={`r${sort === 'r2SharePp' ? ' strong' : ''}`}>{r.r2SharePp !== null ? pts(r.r2SharePp) : '·'}</td>}
                {hasR2 && (
                  <td className="r">
                    {r.guessCorrect === null ? <span className="faint">·</span> : r.guessCorrect ? <span className="ok"><Icon name="check" size="sm" label="correct" /></span> : <span className="no"><Icon name="x" size="sm" label="wrong" /></span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Debrief({ view }: { view: HostView }) {
  const d = view.debrief!;
  const [showAiDots, setShowAiDots] = useState(true);
  const a = d.rounds[1];
  const b = d.rounds[2];
  const hasR2 = !!b;
  const st = d.stats;
  const L = d.learning;
  const cf = (k: string) => d.counterfactuals.find((c) => c.key === k);
  const right = cf('right');
  const hold = cf('hold');
  const smb = cf('smbcut');

  return (
    <div className="stack-lg">
      <Section
        n="01"
        title={`Where everyone landed · Round ${d.quadrantRound}`}
        aside={
          <label className="toggle">
            <input type="checkbox" checked={showAiDots} onChange={(e) => setShowAiDots(e.target.checked)} /> Show AI
          </label>
        }
      >
        <QuadrantScatter points={d.quadrant} showAi={showAiDots} />
      </Section>

      <Section n="02" title="What the room learned" aside={<span className="eyebrow">{st.humans} participants</span>}>
        <div className="stats">
          <Tile k="R1 at dossier right price" v={orDot(st.pctAtRightR1, (x) => pct(x, 0))} s={`within ±50: ${orDot(st.pctNearRightR1, (x) => pct(x, 0))}`} />
          <Tile k="Named primary competitor" v={orDot(st.pctGuessCorrect, (x) => pct(x, 0))} s={`${st.guesses} of ${st.humans} answered`} />
          <Tile
            k="Median profit captured"
            v={
              <>
                {orDot(st.medianCapturedR1, (x) => pct(x, 0))} → {orDot(st.medianCapturedR2, (x) => pct(x, 0))}
              </>
            }
            s="of the best response to actual rivals, R1 → R2"
          />
          <Tile
            k="Avg participant price"
            v={
              <>
                {orDot(L.avgPriceR1, int)} → {orDot(L.avgPriceR2, int)}
              </>
            }
            s={L.pctChanged !== null ? `${pct(L.pctChanged, 0)} changed · ${pct(L.pctUp ?? 0, 0)} up · ${pct(L.pctDown ?? 0, 0)} down` : 'R1 → R2'}
          />
          <Tile
            k="Avg participant profit"
            v={
              <>
                {orDot(L.avgProfitR1, kqar)} → {orDot(L.avgProfitR2, kqar)}
              </>
            }
            s={L.avgProfitR1 !== null && L.avgProfitR2 !== null ? <Delta value={L.avgProfitR2 - L.avgProfitR1} format={(n) => `QAR ${int(n)}`} /> : 'R1 → R2'}
          />
        </div>
      </Section>

      <Section n="03" title="Counterfactuals: what if everyone moved together?" aside={<span className="eyebrow">Summed across all markets</span>}>
        <div className="stack">
          {right && hold && smb && (
            <p className="callout">
              Everyone at their <b>dossier right price</b> earns {qar(right.totalProfit)}, {qar(Math.abs(right.totalProfit - hold.totalProfit))}{' '}
              {right.totalProfit >= hold.totalProfit ? 'more' : 'less'} than everyone holding at 1,000. If the SMB cluster then undercuts each
              other by 100, the room gives back {qar(Math.abs(right.totalProfit - smb.totalProfit))}: a price war among look-alikes.
            </p>
          )}
          <CounterfactualBars items={d.counterfactuals} />
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="r">Avg price</th>
                  <th className="r">Customers</th>
                  <th className="r">Revenue</th>
                  <th className="r">Profit</th>
                  <th className="r">Avg profit / company</th>
                </tr>
              </thead>
              <tbody>
                {d.counterfactuals.map((c) => (
                  <tr key={c.key} className={c.key.startsWith('actual') ? 'hl' : ''}>
                    <td className={c.key.startsWith('actual') ? 'strong' : ''}>{c.label}</td>
                    <td className="r">{int(c.avgPrice)}</td>
                    <td className="r">{int(c.totalUnits)}</td>
                    <td className="r">{int(c.totalRevenue)}</td>
                    <td className="r strong">{int(c.totalProfit)}</td>
                    <td className="r">{int(c.avgProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section n="04" title="Price moves" aside={<span className="eyebrow">All companies · humans + AI</span>}>
        <div className="stack">
          <PriceDistribution r1={a?.priceHistogram} r2={b?.priceHistogram} />
          <table className="data">
            <thead>
              <tr>
                <th>vs QAR 1,000</th>
                <th className="r">Round 1</th>
                {hasR2 && <th className="r">Round 2</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Average price</td>
                <td className="r">{a ? int(a.avgPrice) : '·'}</td>
                {hasR2 && <td className="r strong">{int(b!.avgPrice)}</td>}
              </tr>
              {(['cut', 'hold', 'raise'] as const).map((k) => (
                <tr key={k}>
                  <td>{k === 'hold' ? 'Held' : k === 'cut' ? 'Cut' : 'Raised'}</td>
                  <td className="r">{a?.moves[k] ?? '·'}</td>
                  {hasR2 && <td className="r strong">{b?.moves[k]}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section n="05" title="Markets" aside={<span className="eyebrow">Each market clears on its own</span>}>
        <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Market</th>
              <th className="r">Participants</th>
              <th className="r">R1 avg price</th>
              <th className="r">R1 profit</th>
              {hasR2 && <th className="r">R2 avg price</th>}
              {hasR2 && <th className="r">R2 profit</th>}
            </tr>
          </thead>
          <tbody>
            {d.markets.map((m) => (
              <tr key={m.index}>
                <td>
                  <span className="mkt">Market {m.index + 1}</span>
                </td>
                <td className="r">{m.humans}</td>
                <td className="r">{m.r1 ? int(m.r1.avgPrice) : '·'}</td>
                <td className="r">{m.r1 ? int(m.r1.totalProfit) : '·'}</td>
                {hasR2 && <td className="r">{m.r2 ? int(m.r2.avgPrice) : '·'}</td>}
                {hasR2 && <td className="r strong">{m.r2 ? int(m.r2.totalProfit) : '·'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Section>

      <Section n="06" title="Leaderboard" aside={<span className="eyebrow">Profit first, share change beside it</span>}>
        <Leaderboard rows={d.leaderboard} hasR2={hasR2} />
      </Section>
    </div>
  );
}
