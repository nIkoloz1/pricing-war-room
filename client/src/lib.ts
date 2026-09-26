import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, Price, TimerState } from '../../shared/types';

// ---------------------------------------------------------------------------
//  Socket (one per tab; reconnects automatically)
// ---------------------------------------------------------------------------
let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

export function call<T = unknown>(event: string, payload: unknown, timeoutMs = 8000): Promise<Ack<T>> {
  const s = getSocket();
  return new Promise((resolve) => {
    s.timeout(timeoutMs).emit(event, payload, (err: unknown, res: Ack<T>) => {
      if (err) resolve({ ok: false, error: 'Connection lost. Retrying…' });
      else resolve(res);
    });
  });
}

export function useConnection(): boolean {
  const s = getSocket();
  const [connected, setConnected] = useState(s.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on('connect', on);
    s.on('disconnect', off);
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
    };
  }, [s]);
  return connected;
}

// ---------------------------------------------------------------------------
//  Storage (guarded: some browsers block it)
// ---------------------------------------------------------------------------
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

// ---------------------------------------------------------------------------
//  Countdown synced to server time
// ---------------------------------------------------------------------------
export function useCountdown(timer: TimerState | null, serverNow: number | undefined) {
  const offset = useRef(0);
  useEffect(() => {
    if (serverNow) offset.current = serverNow - Date.now();
  }, [serverNow]);
  const calc = () => {
    if (!timer) return { remainingMs: 0, fraction: 0, paused: false };
    const remainingMs = timer.paused || timer.endsAt === null ? timer.remainingMs : Math.max(0, timer.endsAt - (Date.now() + offset.current));
    return { remainingMs, fraction: timer.durationMs ? remainingMs / timer.durationMs : 0, paused: timer.paused };
  };
  const [state, setState] = useState(calc);
  useEffect(() => {
    setState(calc());
    if (!timer || timer.paused) return;
    const id = setInterval(() => setState(calc()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.endsAt, timer?.paused, timer?.remainingMs, timer?.durationMs, serverNow]);
  return state;
}

// ---------------------------------------------------------------------------
//  Formatting
// ---------------------------------------------------------------------------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const int = (n: number) => nf0.format(Math.round(n));
export const qar = (n: number) => `${n < 0 ? '−' : ''}QAR ${nf0.format(Math.abs(Math.round(n)))}`;
export const money = (n: number) => `${n < 0 ? '−' : ''}${nf0.format(Math.abs(Math.round(n)))}`;
export const pct = (x: number, digits = 1) => `${digits === 0 ? nf0.format(x * 100) : nf1.format(x * 100)}%`;
export const signed = (n: number, f: (x: number) => string = int) => (n > 0 ? `+${f(n)}` : n < 0 ? `−${f(Math.abs(n))}` : f(0));
export const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const kqar = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(2)}M` : a >= 10_000 ? `${Math.round(a / 1000)}k` : nf0.format(a);
  return `${n < 0 ? '−' : ''}${s}`;
};

export const MOVE: Record<Price, { label: string; glyph: string; kind: 'cut' | 'hold' | 'raise' }> = {
  800: { label: 'Cut 20%', glyph: '−20', kind: 'cut' },
  900: { label: 'Cut 10%', glyph: '−10', kind: 'cut' },
  1000: { label: 'Hold', glyph: '=', kind: 'hold' },
  1100: { label: 'Raise 10%', glyph: '+10', kind: 'raise' },
  1200: { label: 'Raise 20%', glyph: '+20', kind: 'raise' },
};

export function sensitivityWord(e: number): string {
  if (e >= 2.2) return 'Very high';
  if (e >= 1.9) return 'High';
  if (e >= 1.6) return 'Medium-high';
  if (e >= 1.25) return 'Medium';
  return 'Low';
}
