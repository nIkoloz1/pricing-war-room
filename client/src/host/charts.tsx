import { useState } from 'react';
import { PRICE_OPTIONS, type Price, type ScenarioOutcome } from '../../../shared/types';
import { int, kqar, qar } from '../lib';

const AXIS = '#8d8d86';
const GRID = '#2c3038';

interface Tip {
  x: number;
  y: number;
  html: React.ReactNode;
}

/** Grouped column chart: how many competitors picked each price, Round 1 vs Round 2. */
export function PriceDistribution({ r1, r2 }: { r1?: Record<Price, number>; r2?: Record<Price, number> }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 640;
  const H = 280;
  const m = { t: 16, r: 8, b: 44, l: 36 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const series = [
    { key: 'Round 1', data: r1, color: 'var(--series-r1)' },
    { key: 'Round 2', data: r2, color: 'var(--series-r2)' },
  ].filter((s) => s.data) as { key: string; data: Record<Price, number>; color: string }[];
  const max = Math.max(1, ...series.flatMap((s) => PRICE_OPTIONS.map((p) => s.data[p])));
  const step = max <= 5 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const band = iw / PRICE_OPTIONS.length;
  const gap = 2;
  const barW = Math.min(44, (band * 0.7 - gap * (series.length - 1)) / series.length);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <div className="stack-sm">
      <div className="chart-legend" aria-hidden={series.length < 2}>
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} /> {s.key}
          </span>
        ))}
      </div>
      <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Number of competitors choosing each price">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={m.l - 8} y={y(t)} fill={AXIS} fontSize={12} textAnchor="end" dominantBaseline="middle" fontFamily="var(--f-mono)">
                {t}
              </text>
            </g>
          ))}
          {PRICE_OPTIONS.map((p, i) => {
            const cx = m.l + band * i + band / 2;
            const groupW = series.length * barW + (series.length - 1) * gap;
            return (
              <g key={p}>
                {series.map((s, k) => {
                  const v = s.data[p];
                  const x = cx - groupW / 2 + k * (barW + gap);
                  const h = Math.max(0, y(0) - y(v));
                  const r = Math.min(4, h, barW / 2);
                  const d = h > 0
                    ? `M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`
                    : '';
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
                                {v} competitor{v === 1 ? '' : 's'}
                              </>
                            ),
                          })
                        }
                      />
                    </g>
                  );
                })}
                <text x={cx} y={H - m.b + 20} fill="#c2c2ba" fontSize={13} textAnchor="middle" fontFamily="var(--f-mono)">
                  {int(p)}
                </text>
                <text x={cx} y={H - m.b + 36} fill={AXIS} fontSize={11} textAnchor="middle" fontFamily="var(--f-mono)">
                  {p < 1000 ? `−${(1000 - p) / 10}%` : p > 1000 ? `+${(p - 1000) / 10}%` : 'hold'}
                </text>
              </g>
            );
          })}
          <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke="#4a505b" strokeWidth={1} />
        </svg>
        {tip && (
          <div className="tooltip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
            {tip.html}
          </div>
        )}
      </div>
    </div>
  );
}

/** Horizontal bars: total market profit for actual outcomes vs counterfactuals. */
export function CounterfactualBars({ items }: { items: ScenarioOutcome[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 640;
  const rowH = 44;
  const m = { t: 8, r: 90, b: 8, l: 220 };
  const H = m.t + m.b + items.length * rowH;
  const iw = W - m.l - m.r;
  const min = Math.min(0, ...items.map((i) => i.totalProfit));
  const max = Math.max(1, ...items.map((i) => i.totalProfit));
  const x = (v: number) => m.l + ((v - min) / (max - min)) * iw;
  const color = (k: string) => (k === 'actual1' ? 'var(--series-r1)' : k === 'actual2' ? 'var(--series-r2)' : '#6b6f78');

  return (
    <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Total market profit by scenario">
        {items.map((it, i) => {
          const y0 = m.t + i * rowH;
          const bh = 22;
          const by = y0 + (rowH - bh) / 2;
          const x0 = x(0);
          const x1 = x(it.totalProfit);
          const left = Math.min(x0, x1);
          const w = Math.abs(x1 - x0);
          const r = Math.min(4, w / 2);
          const pos = it.totalProfit >= 0;
          const d = w > 0
            ? pos
              ? `M${left},${by} h${w - r} q${r},0 ${r},${r} v${bh - 2 * r} q0,${r} ${-r},${r} h${-(w - r)} z`
              : `M${left + w},${by} h${-(w - r)} q${-r},0 ${-r},${r} v${bh - 2 * r} q0,${r} ${r},${r} h${w - r} z`
            : '';
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
                      Demand {int(it.totalDemand)} · revenue {qar(it.totalRevenue)}
                    </>
                  ),
                })
              }
            >
              <rect x={0} y={y0} width={W} height={rowH} fill="transparent" />
              <text x={m.l - 12} y={y0 + rowH / 2} fill={it.key.startsWith('actual') ? '#f2f2eb' : '#c2c2ba'} fontSize={13.5} textAnchor="end" dominantBaseline="middle" fontWeight={it.key.startsWith('actual') ? 600 : 400}>
                {it.label}
              </text>
              {d && <path d={d} fill={color(it.key)} />}
              <text x={Math.max(x0, x1) + 8} y={y0 + rowH / 2} fill="#f2f2eb" fontSize={13} dominantBaseline="middle" fontFamily="var(--f-mono)">
                {kqar(it.totalProfit)}
              </text>
            </g>
          );
        })}
        <line x1={x(0)} x2={x(0)} y1={m.t} y2={H - m.b} stroke="#4a505b" />
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
          {tip.html}
        </div>
      )}
    </div>
  );
}
