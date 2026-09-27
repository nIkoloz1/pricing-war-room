import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { PlayerView, Price } from '../../../shared/types';
import { call, getSocket, int, moveLabel, pct, store, useConnection } from '../lib';
import { Brandmark, ConnectionPill, PricePicker, TimerBar } from '../ui/common';
import { Briefcase, DossierFold, MarketBrief } from './Dossier';
import { ResultsScreen } from './Results';
import { Round2DeskScreen } from './Round2Desk';

const TOKEN_KEY = 'pwr.token';
const params = new URLSearchParams(window.location.search);
/** Host preview of a demo participant: use that token, never persist it. */
const previewToken = params.get('as');

export function ParticipantApp() {
  const connected = useConnection();
  const [token, setToken] = useState<string | null>(() => previewToken ?? store.get(TOKEN_KEY));
  const [view, setView] = useState<PlayerView | null>(null);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const forget = useCallback((msg?: string) => {
    if (!previewToken) store.remove(TOKEN_KEY);
    setToken(null);
    setView(null);
    if (msg) setNotice(msg);
  }, []);

  // Resume on every (re)connect.
  useEffect(() => {
    const s = getSocket();
    const resume = async () => {
      const t = previewToken ?? store.get(TOKEN_KEY);
      if (!t) return setBooting(false);
      const res = await call<{ view: PlayerView }>('player:resume', { token: t });
      if (res.ok && res.data) setView(res.data.view);
      else if (res.error === 'unknown') forget('Your previous session has ended. Join the current session below.');
      setBooting(false);
    };
    const onState = (v: PlayerView) => setView(v);
    const onGone = () => {
      if (!previewToken) history.replaceState(null, '', location.pathname); // drop the stale ?code=
      forget('The host started a new session. Join again with the new code.');
    };
    s.on('connect', resume);
    s.on('player:state', onState);
    s.on('player:gone', onGone);
    if (s.connected) resume();
    return () => {
      s.off('connect', resume);
      s.off('player:state', onState);
      s.off('player:gone', onGone);
    };
  }, [forget]);

  const joined = (t: string, v: PlayerView) => {
    store.set(TOKEN_KEY, t);
    setToken(t);
    setView(v);
    setNotice(null);
  };

  return (
    <main className="p-shell">
      <div className="p-top">
        <Brandmark />
        {view && <ConnectionPill connected={connected} />}
      </div>
      {previewToken && <div className="banner">Host preview · you are viewing a demo participant's screen.</div>}
      {!view && booting && token ? (
        <div className="center-screen">
          <div className="stack" style={{ justifyItems: 'center' }}>
            <div className="radar" aria-hidden="true" />
            <p className="muted">Reconnecting to the war room…</p>
          </div>
        </div>
      ) : !view ? (
        <JoinScreen onJoined={joined} notice={notice} />
      ) : (
        <PhaseScreen view={view} token={token!} onView={setView} />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
function JoinScreen({ onJoined, notice }: { onJoined: (t: string, v: PlayerView) => void; notice: string | null }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => (new URLSearchParams(location.search).get('code') ?? '').toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await call<{ token: string; view: PlayerView }>('player:join', { name, code });
    setBusy(false);
    if (res.ok && res.data) onJoined(res.data.token, res.data.view);
    else setError(res.error ?? 'Could not join.');
  };

  return (
    <div className="stack-lg">
      <section className="hero">
        <span className="eyebrow brass">Live pricing simulation</span>
        <h1 className="display">
          The Pricing <em>War Room</em>
        </h1>
        <p className="tagline">“One market. Your price changes everyone’s outcome.”</p>
      </section>

      {notice && <div className="banner">{notice}</div>}

      <form className="card pad stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" className="input" autoComplete="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amira" required />
        </div>
        <div className="field">
          <label htmlFor="code">Session code</label>
          <input
            id="code"
            className="input code"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="CODE"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            required
          />
        </div>
        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary lg block" disabled={busy || !name.trim() || code.length < 4}>
          {busy ? 'Entering…' : 'Enter the war room'}
        </button>
      </form>

      <div className="case-rule">
        <span className="eyebrow">You will receive</span>
      </div>
      <div className="stack-sm" style={{ color: 'var(--text-2)', fontSize: 15 }}>
        <p>① A confidential company dossier that only you can see.</p>
        <p>② One pricing decision per round, made at the same time as every other CEO.</p>
        <p>③ Your own market share, revenue and profit after each round.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PhaseScreen({ view, token, onView }: { view: PlayerView; token: string; onView: (v: PlayerView) => void }) {
  const { phase } = view.session;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lock = async (price: Price) => {
    setBusy(true);
    setError(null);
    const res = await call<{ view: PlayerView }>('player:submit', { token, price });
    setBusy(false);
    if (res.ok && res.data) onView(res.data.view);
    else setError(res.error ?? 'Could not submit. Try again.');
  };

  const guess = async (competitorId: string) => {
    setBusy(true);
    setError(null);
    const res = await call<{ view: PlayerView }>('player:guess', { token, competitorId });
    setBusy(false);
    if (res.ok && res.data) onView(res.data.view);
    else setError(res.error ?? 'Could not send your answer. Try again.');
  };

  const errorBanner = error && (
    <div className="banner error" role="alert">
      {error}
    </div>
  );

  switch (phase) {
    case 'registration':
      return <Lobby view={view} />;
    case 'r1_decision':
      return view.me.decisions[1] ? (
        <Locked view={view} round={1} />
      ) : (
        <DecideRound1 view={view} busy={busy} onLock={lock} error={errorBanner} />
      );
    case 'r1_clearing':
      return <Locked view={view} round={1} clearing />;
    case 'r1_results':
    case 'workshop':
      return view.me.results[1] ? <ResultsScreen view={view} round={1} /> : <Locked view={view} round={1} clearing />;
    case 'r2_decision':
      return view.me.decisions[2] ? (
        <Locked view={view} round={2} />
      ) : (
        <Round2DeskScreen view={view} busy={busy} onLock={lock} onGuess={guess} error={errorBanner} />
      );
    case 'r2_clearing':
      return <Locked view={view} round={2} clearing />;
    case 'r2_results':
    case 'debrief':
      return view.me.results[2] ? <ResultsScreen view={view} round={2} /> : <Locked view={view} round={2} clearing />;
  }
}

function Lobby({ view }: { view: PlayerView }) {
  return (
    <div className="stack-lg">
      <header className="stack-sm">
        <span className="eyebrow brass">Welcome, {view.me.name}</span>
        <h1 className="display" style={{ fontSize: 34 }}>
          You are CEO of {view.me.profile.company}.
        </h1>
        <p className="muted">Study your dossier. The market opens when the host starts Round 1.</p>
      </header>
      <Briefcase profile={view.me.profile} codename={view.me.codename} playerId={view.me.id} />
      <MarketBrief />
      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <span className="pill live">
          <span className="dot" /> Waiting for the market to open
        </span>
      </div>
    </div>
  );
}

function DecideRound1({ view, busy, onLock, error }: { view: PlayerView; busy: boolean; onLock: (p: Price) => void; error: React.ReactNode }) {
  const start = view.me.start;
  return (
    <div className="stack-lg">
      <TimerBar timer={view.session.timer} serverNow={view.serverNow} label="Round 1" />
      <header className="stack-sm">
        <span className="eyebrow brass">Round 1 · {view.me.profile.company}</span>
        <h1 className="display" style={{ fontSize: 44 }}>
          Set your price.
        </h1>
        <p className="muted">Use your dossier: the value route or the CLV route. You do not know what the other CEOs will choose.</p>
      </header>
      {start && (
        <section className="startcard" aria-label="Your starting position">
          <div>
            <span className="k">Starting customers</span>
            <span className="v">{int(start.customers)}</span>
          </div>
          <div>
            <span className="k">Starting share</span>
            <span className="v">{pct(start.share)}</span>
          </div>
        </section>
      )}
      <DossierFold profile={view.me.profile} codename={view.me.codename} />
      {error}
      <PricePicker onLock={onLock} busy={busy} />
    </div>
  );
}

function Locked({ view, round, clearing = false }: { view: PlayerView; round: 1 | 2; clearing?: boolean }) {
  const price = view.me.decisions[round];
  const decisionPhase = view.session.phase === (round === 1 ? 'r1_decision' : 'r2_decision');
  return (
    <div className="stack-lg">
      {decisionPhase && <TimerBar timer={view.session.timer} serverNow={view.serverNow} label={`Round ${round}`} />}
      <div className="card locked open-in">
        <span className="eyebrow">Round {round} · {view.me.profile.company}</span>
        {price ? (
          <>
            <span className="lockstamp">DECISION LOCKED</span>
            <span className="big num">
              <span style={{ fontSize: 20, fontFamily: 'var(--f-mono)', color: 'var(--text-3)', marginRight: 8, verticalAlign: '0.9em' }}>QAR</span>
              {int(price)}
            </span>
            <span className="pill">{moveLabel(price) === 'hold' ? 'Hold' : `${moveLabel(price)} vs 1,000`}</span>
          </>
        ) : (
          <>
            <span className="lockstamp">TIME</span>
            <p className="muted">No decision received. {round === 1 ? 'Your price stays at QAR 1,000.' : 'Your price stays at your Round 1 price.'}</p>
          </>
        )}
        <div className="radar" aria-hidden="true" style={{ marginTop: 10 }} />
        <p className="muted" role="status">
          {clearing || !decisionPhase ? 'The market is clearing. Results arrive shortly.' : 'Waiting for the market to clear. The other CEOs are still deciding.'}
        </p>
      </div>
    </div>
  );
}
