import { useState } from 'react';
import { PRICE_OPTIONS, type Price, type TimerState } from '../../../shared/types';
import { MOVE, clock, int, useCountdown } from '../lib';

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

export function PricePicker({
  onLock,
  busy,
  previous,
}: {
  onLock: (p: Price) => void;
  busy: boolean;
  previous?: Price;
}) {
  const [sel, setSel] = useState<Price | null>(null);
  return (
    <div className="stack">
      <div className="prices" role="group" aria-label="Choose your price">
        {PRICE_OPTIONS.map((p) => {
          const m = MOVE[p];
          return (
            <button
              key={p}
              type="button"
              className={`price-btn ${m.kind}`}
              aria-pressed={sel === p}
              onClick={() => setSel(p)}
              disabled={busy}
            >
              <span className="glyph" aria-hidden="true">
                {m.glyph}
              </span>
              <span>
                <span className="amt">
                  <small>QAR</small>
                  {int(p)}
                </span>
                <span className="move" style={{ display: 'block' }}>
                  {m.label}
                  {previous === p ? ' · your Round 1 price' : ''}
                </span>
              </span>
              <span className="check" aria-hidden="true">
                {sel === p ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <button className="btn primary lg block" disabled={sel === null || busy} onClick={() => sel && onLock(sel)}>
        {busy ? 'Locking…' : sel ? `Lock in QAR ${int(sel)}` : 'Select a price'}
      </button>
      <p className="faint" style={{ fontSize: 13.5, textAlign: 'center' }}>
        Decisions are final and simultaneous. Everyone else is choosing right now.
      </p>
    </div>
  );
}

export function Delta({ value, format = int, invert = false, neutral = false }: { value: number; format?: (n: number) => string; invert?: boolean; neutral?: boolean }) {
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
