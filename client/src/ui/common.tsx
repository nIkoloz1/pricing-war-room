import { useState } from 'react';
import { PRICE_OPTIONS, type Price, type TimerState } from '../../../shared/types';
import { clock, int, moveLabel, useCountdown } from '../lib';

export function Briefcase({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="20" width="44" height="32" rx="5" fill="none" stroke="var(--brass)" strokeWidth="4" />
      <path d="M24 20v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" fill="none" stroke="var(--brass)" strokeWidth="4" />
      <path d="M10 33h44" stroke="var(--brass)" strokeWidth="4" />
      <rect x="28" y="29" width="8" height="8" rx="1.5" fill="var(--brass)" />
    </svg>
  );
}

export function Brandmark({ sub = 'QSTP · Pricing Workshop' }: { sub?: string }) {
  return (
    <div className="brandmark">
      <Briefcase />
      <div className="t">
        The Pricing War Room
        <br />
        <span style={{ color: 'var(--text-3)' }}>{sub}</span>
      </div>
    </div>
  );
}

export function ConnectionPill({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="pill live" title="Connected">
      <span className="dot" /> Live
    </span>
  ) : (
    <span className="pill warn" role="status">
      <span className="dot" /> Reconnecting
    </span>
  );
}

export function TimerBar({ timer, serverNow, label }: { timer: TimerState | null; serverNow: number; label: string }) {
  const { remainingMs, fraction, paused } = useCountdown(timer, serverNow);
  const urgent = !paused && remainingMs <= 20_000;
  return (
    <div className={`timer${urgent ? ' urgent' : ''}${paused ? ' paused' : ''}`} role="timer" aria-live="off">
      <span className="eyebrow">{paused ? 'Paused' : label}</span>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
      </div>
      <span className="clock" aria-label={`${Math.ceil(remainingMs / 1000)} seconds left`}>
        {clock(remainingMs)}
      </span>
    </div>
  );
}

/** 4×4 grid of the 16 prices, then an explicit lock step. */
export function PricePicker({
  onLock,
  busy,
  previous,
  lockedReason,
}: {
  onLock: (p: Price) => void;
  busy: boolean;
  previous?: Price;
  /** When set, the grid is disabled and this explains why. */
  lockedReason?: string;
}) {
  const [sel, setSel] = useState<Price | null>(null);
  const disabled = busy || !!lockedReason;
  return (
    <div className="stack">
      <div className={`price-grid${lockedReason ? ' is-locked' : ''}`} role="group" aria-label="Choose your price, QAR per customer per month">
        {PRICE_OPTIONS.map((p) => {
          const d = p - 1000;
          return (
            <button
              key={p}
              type="button"
              className={`pcell ${d < 0 ? 'cut' : d > 0 ? 'raise' : 'hold'}`}
              aria-pressed={sel === p}
              aria-label={`QAR ${int(p)}${previous === p ? ', your Round 1 price' : ''}`}
              onClick={() => setSel(p)}
              disabled={disabled}
            >
              {previous === p && <span className="prev">R1</span>}
              <span className="cur">QAR</span>
              <span className="amt">{int(p)}</span>
              <span className="mv">{moveLabel(p)}</span>
            </button>
          );
        })}
      </div>
      {lockedReason ? (
        <p className="banner" role="status">
          {lockedReason}
        </p>
      ) : (
        <button className="btn primary lg block" disabled={sel === null || busy} onClick={() => sel && onLock(sel)}>
          {busy ? 'Locking…' : sel ? `Lock in QAR ${int(sel)}` : 'Select a price'}
        </button>
      )}
      <p className="faint" style={{ fontSize: 13.5, textAlign: 'center' }}>
        Decisions are final and simultaneous. Every other CEO in your market is choosing right now.
      </p>
    </div>
  );
}

export function Delta({
  value,
  format = int,
  invert = false,
  neutral = false,
}: {
  value: number;
  format?: (n: number) => string;
  invert?: boolean;
  neutral?: boolean;
}) {
  const eps = 1e-9;
  const good = invert ? value < -eps : value > eps;
  const bad = invert ? value > eps : value < -eps;
  const cls = neutral ? 'flat' : good ? 'up' : bad ? 'down' : 'flat';
  const arrow = value > eps ? '▲' : value < -eps ? '▼' : '■';
  const txt = value > eps ? `+${format(value)}` : value < -eps ? `−${format(Math.abs(value))}` : format(0);
  return (
    <span className={`delta ${cls}`}>
      <span aria-hidden="true">{arrow} </span>
      {txt}
    </span>
  );
}

/** Horizontal similarity meter + percentage (never colour alone). */
export function Similarity({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="simm" title={`${pct}% similar to you`}>
      <span className="simbar" aria-hidden="true">
        <i style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
      <span className="simv">{pct}%</span>
    </span>
  );
}
