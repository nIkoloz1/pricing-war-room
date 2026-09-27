import { useState } from 'react';
import { PRICE_OPTIONS, type QuadrantPoint, type ScenarioOutcome } from '../../../shared/types';
import { int, kqar, qar } from '../lib';

const AXIS = '#868ba2';
const GRID = '#ebebf0';
const SURFACE = '#ffffff';
const INK = '#14172b';
const INK2 = '#4a4f66';
const BASE = '#c9ccd6';
const MUTED = '#b4b7c4';

interface Tip {
  x: number;
  y: number;
  html: React.ReactNode;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  return tip ? (
    <div className="tooltip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
      {tip.html}
    </div>
  ) : null;
}

/** Grouped columns: how many companies picked each of the 16 prices, Round 1 vs Round 2. */
export function PriceDistribution({ r1, r2 }: { r1?: Record<number, number>; r2?: Record<number, number> }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 760;
  const H = 280;
  const m = { t: 16, r: 8, b: 44, l: 36 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const series = [
    { key: 'Round 1', data: r1, color: 'var(--series-r1)' },
    { key: 'Round 2', data: r2, color: 'var(--series-r2)' },
  ].filter((s) => s.data) as { key: string; data: Record<number, number>; color: string }[];
  const val = (s: { data: Record<number, number> }, p: number) => s.data[p] ?? 0;
  const max = Math.max(1, ...series.flatMap((s) => PRICE_OPTIONS.map((p) => val(s, p))));
  const step = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const band = iw / PRICE_OPTIONS.length;
  const gap = 2;
  const barW = Math.min(18, (band * 0.78 - gap * (series.length - 1)) / series.length);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <div className="stack-sm">
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} /> {s.key}
            </span>
          ))}
        </div>
      )}
      <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Number of companies choosing each price">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={m.l - 8} y={y(t)} fill={AXIS} fontSize={12} textAnchor="end" dominantBaseline="middle" fontFamily="var(--f-sans)">
                {t}
              </text>
            </g>
          ))}
          {PRICE_OPTIONS.map((p, i) => {
            const cx = m.l + band * i + band / 2;
            const groupW = series.length * barW + (series.length - 1) * gap;
            return (
              <g key={p}>
                {p === 1000 && <rect x={cx - band / 2} y={m.t} width={band} height={ih} fill="rgba(20,23,43,0.04)" />}
                {series.map((s, k) => {
                  const v = val(s, p);
                  const x = cx - groupW / 2 + k * (barW + gap);
                  const h = Math.max(0, y(0) - y(v));
                  const r = Math.min(4, h, barW / 2);
                  const d = h > 0 ? `M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z` : '';
                  return (
                    <g key={s.key}>
                      {d && <path d={d} fill={s.color} />}
                      <rect
                        x={x - gap / 2}
                        y={m.t}
                        width={barW + gap}
                        height={ih}
                        fill="transparent"
                        onMouseMove={() =>
                          setTip({
                            x: ((x + barW / 2) / W) * 100,
                            y: (y(v) / H) * 100,
                            html: (
                              <>
                                <b>{s.key}</b> · QAR {int(p)}
                                <br />
                                {v} compan{v === 1 ? 'y' : 'ies'}
                              </>
                            ),
                          })
                        }
                      />
                    </g>
                  );
                })}
                <text x={cx} y={H - m.b + 18} fill={p === 1000 ? INK : INK2} fontSize={11} textAnchor="middle" fontFamily="var(--f-sans)">
                  {int(p)}
                </text>
              </g>
            );
          })}
          <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={BASE} strokeWidth={1} />
          <text x={m.l + iw / 2} y={H - 6} fill={AXIS} fontSize={11} textAnchor="middle" fontFamily="var(--f-sans)">
            PRICE (QAR / MONTH) · 1,000 = GOING RATE
          </text>
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}

/** Horizontal bars: total profit for actual outcomes vs counterfactuals. */
export function CounterfactualBars({ items }: { items: ScenarioOutcome[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 760;
  const rowH = 44;
  const m = { t: 8, r: 90, b: 8, l: 330 };
  const H = m.t + m.b + items.length * rowH;
  const iw = W - m.l - m.r;
  const min = Math.min(0, ...items.map((i) => i.totalProfit));
  const max = Math.max(1, ...items.map((i) => i.totalProfit));
  const x = (v: number) => m.l + ((v - min) / (max - min)) * iw;
  const color = (k: string) => (k === 'actual1' ? 'var(--series-r1)' : k === 'actual2' ? 'var(--series-r2)' : MUTED);

  return (
    <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Total profit by scenario">
        {items.map((it, i) => {
          const y0 = m.t + i * rowH;
          const bh = 22;
          const by = y0 + (rowH - bh) / 2;
          const x0 = x(0);
          const x1 = x(it.totalProfit);
          const left = Math.min(x0, x1);
          const w = Math.abs(x1 - x0);
          const r = Math.min(4, w / 2);
          const d =
            w > 0
              ? it.totalProfit >= 0
                ? `M${left},${by} h${w - r} q${r},0 ${r},${r} v${bh - 2 * r} q0,${r} ${-r},${r} h${-(w - r)} z`
                : `M${left + w},${by} h${-(w - r)} q${-r},0 ${-r},${r} v${bh - 2 * r} q0,${r} ${r},${r} h${w - r} z`
              : '';
          const actual = it.key.startsWith('actual');
          return (
            <g
              key={it.key}
              onMouseMove={() =>
                setTip({
                  x: (Math.max(x0, x1) / W) * 100,
                  y: (by / H) * 100,
                  html: (
                    <>
                      <b>{it.label}</b>
                      <br />
                      Profit {qar(it.totalProfit)} · avg {qar(it.avgProfit)}
                      <br />
                      Customers {int(it.totalUnits)} · revenue {qar(it.totalRevenue)}
                    </>
                  ),
                })
              }
            >
              <rect x={0} y={y0} width={W} height={rowH} fill="transparent" />
              <text x={m.l - 12} y={y0 + rowH / 2} fill={actual ? INK : INK2} fontSize={13.5} textAnchor="end" dominantBaseline="middle" fontWeight={actual ? 600 : 400}>
                {it.label}
              </text>
              {d && <path d={d} fill={color(it.key)} />}
              <text x={Math.max(x0, x1) + 8} y={y0 + rowH / 2} fill={INK} fontSize={13} dominantBaseline="middle" fontFamily="var(--f-sans)">
                {kqar(it.totalProfit)}
              </text>
            </g>
          );
        })}
        <line x1={x(0)} x2={x(0)} y1={m.t} y2={H - m.b} stroke={BASE} />
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Profit change (% vs holding at 1,000) against share change (pts vs start). */
export function QuadrantScatter({ points, showAi }: { points: QuadrantPoint[]; showAi: boolean }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 760;
  const H = 460;
  const m = { t: 20, r: 20, b: 44, l: 56 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const shown = points.filter((p) => showAi || p.kind === 'human');
  const xMax = Math.max(2, ...shown.map((p) => Math.abs(p.x))) * 1.15;
  const yMax = Math.max(10, ...shown.map((p) => Math.abs(p.y))) * 1.15;
  const x = (v: number) => m.l + ((v + xMax) / (2 * xMax)) * iw;
  const y = (v: number) => m.t + ((yMax - v) / (2 * yMax)) * ih;
  const niceStep = (span: number) => [1, 2, 5, 10, 20, 25, 50, 100].find((s) => span / s <= 5) ?? 100;
  const xs = niceStep(xMax);
  const ys = niceStep(yMax);
  const xt = Array.from({ length: 2 * Math.floor(xMax / xs) + 1 }, (_, i) => (i - Math.floor(xMax / xs)) * xs);
  const yt = Array.from({ length: 2 * Math.floor(yMax / ys) + 1 }, (_, i) => (i - Math.floor(yMax / ys)) * ys);
  const labels = [
    { tx: W - m.r - 10, ty: m.t + 18, a: 'end', t: 'PROFIT AND SHARE UP', s: 'value-led growth' },
    { tx: m.l + 10, ty: m.t + 18, a: 'start', t: 'PROFIT UP, SHARE DOWN', s: 'harvesting' },
    { tx: W - m.r - 10, ty: H - m.b - 26, a: 'end', t: 'SHARE UP, PROFIT DOWN', s: 'buying share' },
    { tx: m.l + 10, ty: H - m.b - 26, a: 'start', t: 'LOSING BOTH', s: 'value problem' },
  ];
  const ordered = [...shown].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'ai' ? -1 : 1));

  return (
    <div className="stack-sm">
      <div className="chart-legend">
        <span>
          <i style={{ background: 'var(--violet)', borderRadius: '50%' }} /> Participants
        </span>
        {showAi && (
          <span>
            <i style={{ background: MUTED, borderRadius: '50%' }} /> AI companies
          </span>
        )}
      </div>
      <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Profit change against market share change">
          <rect x={x(0)} y={m.t} width={W - m.r - x(0)} height={y(0) - m.t} fill="rgba(212,242,74,0.16)" />
          <rect x={m.l} y={y(0)} width={x(0) - m.l} height={H - m.b - y(0)} fill="rgba(217,59,51,0.05)" />
          {xt.map((t) => (
            <g key={`x${t}`}>
              <line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke={GRID} />
              <text x={x(t)} y={H - m.b + 16} fill={AXIS} fontSize={11} textAnchor="middle" fontFamily="var(--f-sans)">
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          ))}
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} />
              <text x={m.l - 8} y={y(t)} fill={AXIS} fontSize={11} textAnchor="end" dominantBaseline="middle" fontFamily="var(--f-sans)">
                {t > 0 ? `+${t}%` : `${t}%`}
              </text>
            </g>
          ))}
          <line x1={x(0)} x2={x(0)} y1={m.t} y2={H - m.b} stroke={BASE} strokeWidth={1.5} />
          <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={BASE} strokeWidth={1.5} />
          {labels.map((l) => (
            <g key={l.t}>
              <text x={l.tx} y={l.ty} fill={INK2} fontSize={11.5} textAnchor={l.a as 'start' | 'end'} fontFamily="var(--f-sans)" letterSpacing="0.08em">
                {l.t}
              </text>
              <text x={l.tx} y={l.ty + 16} fill={AXIS} fontSize={12} textAnchor={l.a as 'start' | 'end'} fontStyle="italic">
                {l.s}
              </text>
            </g>
          ))}
          {ordered.map((p) => (
            <circle
              key={p.id}
              cx={x(p.x)}
              cy={y(p.y)}
              r={p.kind === 'human' ? 7 : 5}
              fill={p.kind === 'human' ? 'var(--violet)' : MUTED}
              stroke={SURFACE}
              strokeWidth={2}
              onMouseMove={() =>
                setTip({
                  x: (x(p.x) / W) * 100,
                  y: ((y(p.y) - 8) / H) * 100,
                  html: (
                    <>
                      <b>{p.label}</b>
                      <br />
                      Share {p.x >= 0 ? '+' : '−'}
                      {Math.abs(p.x).toFixed(1)} pts · profit {p.y >= 0 ? '+' : '−'}
                      {Math.abs(p.y).toFixed(0)}%
                    </>
                  ),
                })
              }
            />
          ))}
          <text x={W - m.r} y={H - 6} fill={AXIS} fontSize={11} textAnchor="end" fontFamily="var(--f-sans)">
            MARKET SHARE CHANGE VS START (PTS) →
          </text>
          <text x={14} y={m.t + ih / 2} fill={AXIS} fontSize={11} textAnchor="middle" fontFamily="var(--f-sans)" transform={`rotate(-90 14 ${m.t + ih / 2})`}>
            PROFIT CHANGE VS HOLDING AT 1,000 →
          </text>
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}
