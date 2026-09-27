import QRCode from 'qrcode';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PHASE_LABEL, type HostAction, type HostView, type Phase } from '../../../shared/types';
import { call, clock, getSocket, int, store, useConnection, useCountdown } from '../lib';
import { Brandmark, ConnectionPill } from '../ui/common';
import { Icon } from '../ui/icons';
import { Debrief, RoundSummary } from './Debrief';

const KEY = 'pwr.hostKey';

export function HostApp() {
  const connected = useConnection();
  const [key, setKey] = useState<string | null>(() => new URLSearchParams(location.search).get('key') ?? store.get(KEY));
  const [view, setView] = useState<HostView | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Authenticate on every (re)connect so the dashboard never needs a refresh.
  useEffect(() => {
    if (!key) return;
    const s = getSocket();
    const auth = async () => {
      const res = await call<HostView>('host:auth', { key });
      if (res.ok && res.data) {
        store.set(KEY, key);
        setView(res.data);
        setAuthError(null);
        if (location.search.includes('key=')) history.replaceState(null, '', location.pathname);
      } else if (res.error === 'Invalid host key.') {
        store.remove(KEY);
        setKey(null);
        setAuthError(res.error);
      }
    };
    const onState = (v: HostView) => setView(v);
    s.on('connect', auth);
    s.on('host:state', onState);
    if (s.connected) auth();
    return () => {
      s.off('connect', auth);
      s.off('host:state', onState);
    };
  }, [key]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const act = useCallback(
    async (action: HostAction) => {
      const res = await call('host:action', { key, action });
      if (!res.ok) setToast(res.error ?? 'Action failed.');
    },
    [key],
  );

  if (!key || !view) {
    return <HostLogin onKey={(k) => setKey(k)} error={authError} waiting={!!key && !view} />;
  }

  return (
    <main className="h-shell">
      <header className="h-header">
        <div className="h-title">
          <Brandmark sub="Host dashboard" />
        </div>
        <Stepper phase={view.session.phase} />
        <div className="row">
          <span className="pill">
            Code <b style={{ color: 'var(--ink)', letterSpacing: '0.16em' }}>{view.session.code}</b>
          </span>
          <ConnectionPill connected={connected} />
        </div>
      </header>

      <StatsRow view={view} />
      <Controls view={view} act={act} hostKey={key} />

      <PhaseBody view={view} act={act} />

      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </main>
  );
}

function HostLogin({ onKey, error, waiting }: { onKey: (k: string) => void; error: string | null; waiting: boolean }) {
  const [k, setK] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (k.trim()) onKey(k.trim());
  };
  return (
    <main className="p-shell" style={{ justifyContent: 'center' }}>
      <form className="card pad stack" onSubmit={submit}>
        <Brandmark sub="Host dashboard" />
        <h1 className="display" style={{ fontSize: 34 }}>
          Host access
        </h1>
        <div className="field">
          <label htmlFor="hk">Host key</label>
          <input id="hk" className="input" type="password" value={k} onChange={(e) => setK(e.target.value)} autoFocus />
        </div>
        {error && <div className="banner error">{error}</div>}
        <button className="btn primary lg block" disabled={waiting || !k.trim()}>
          {waiting ? 'Connecting…' : 'Open dashboard'}
        </button>
      </form>
    </main>
  );
}

const STEPS: { label: string; phases: Phase[] }[] = [
  { label: 'Registration', phases: ['registration'] },
  { label: 'Round 1', phases: ['r1_decision', 'r1_clearing', 'r1_results'] },
  { label: 'Workshop', phases: ['workshop'] },
  { label: 'Round 2', phases: ['r2_decision', 'r2_clearing', 'r2_results'] },
  { label: 'Debrief', phases: ['debrief'] },
];

function Stepper({ phase }: { phase: Phase }) {
  const idx = STEPS.findIndex((s) => s.phases.includes(phase));
  return (
    <nav className="stepper" aria-label="Game phase">
      {STEPS.map((s, i) => (
        <span key={s.label} className={`step${i === idx ? ' active' : i < idx ? ' done' : ''}`} aria-current={i === idx ? 'step' : undefined}>
          <span className="n">{i < idx ? <Icon name="check" size="sm" /> : i + 1}</span>
          {s.label}
        </span>
      ))}
    </nav>
  );
}

function StatsRow({ view }: { view: HostView }) {
  const c = view.counts;
  const inRound = view.session.phase === 'r1_decision' || view.session.phase === 'r2_decision';
  return (
    <section className="stats" aria-label="Live counts">
      <div className="card stat">
        <span className="k">Connected humans</span>
        <span className="v num">
          {c.connected} <small>/ {c.maxHumans}</small>
        </span>
        <span className="s">{c.humans} registered</span>
      </div>
      <div className="card stat">
        <span className="k">Total competitors</span>
        <span className="v num">{c.totalCompetitors}</span>
        <span className="s">
          {c.markets} market{c.markets === 1 ? '' : 's'} of 10 · {c.humans} human + {c.aiCompetitors} AI
        </span>
      </div>
      <div className="card stat">
        <span className="k">Current phase</span>
        <span className="v" style={{ fontSize: 30 }}>
          {PHASE_LABEL[view.session.phase]}
        </span>
        <span className="s">{view.session.registrationOpen ? 'Registration open' : 'Registration closed'}</span>
      </div>
      <div className="card stat">
        <span className="k">Submissions</span>
        <span className="v num">
          {inRound ? c.submissions : '–'} <small>/ {c.expectedSubmissions}</small>
        </span>
        <div className="progress" aria-hidden="true">
          <i style={{ width: `${inRound && c.expectedSubmissions ? (c.submissions / c.expectedSubmissions) * 100 : 0}%` }} />
        </div>
      </div>
    </section>
  );
}

function Controls({ view, act, hostKey }: { view: HostView; act: (a: HostAction) => void; hostKey: string }) {
  const { phase, timer, registrationOpen } = view.session;
  const inRound = phase === 'r1_decision' || phase === 'r2_decision';
  const [confirmReset, setConfirmReset] = useState(false);

  let primary: { label: string; action: HostAction; disabled?: boolean } | null = null;
  switch (phase) {
    case 'registration':
      primary = { label: 'Start Round 1', action: { type: 'startRound', round: 1 }, disabled: view.counts.humans === 0 };
      break;
    case 'r1_decision':
    case 'r2_decision':
      primary = { label: `End Round ${phase === 'r1_decision' ? 1 : 2} now`, action: { type: 'endRound' } };
      break;
    case 'r1_clearing':
      primary = { label: 'Reveal Round 1', action: { type: 'reveal' } };
      break;
    case 'r1_results':
      primary = { label: 'Start workshop phase', action: { type: 'startWorkshop' } };
      break;
    case 'workshop':
      primary = { label: 'Start Round 2', action: { type: 'startRound', round: 2 } };
      break;
    case 'r2_clearing':
      primary = { label: 'Reveal Round 2', action: { type: 'reveal' } };
      break;
    case 'r2_results':
      primary = { label: 'Show debrief', action: { type: 'showDebrief' } };
      break;
  }

  return (
    <section className="card controls" aria-label="Host controls">
      <div className="row between">
        <div className="row">
          {primary && (
            <button className="btn primary lg" disabled={primary.disabled} onClick={() => act(primary!.action)}>
              {primary.label} →
            </button>
          )}
          {phase === 'r1_results' && (
            <button className="btn lg" onClick={() => act({ type: 'startRound', round: 2 })}>
              Skip to Round 2
            </button>
          )}
          {inRound && timer && (
            <>
              {timer.paused ? (
                <button className="btn lg teal" onClick={() => act({ type: 'resume' })}>
                  <Icon name="play" /> Resume
                </button>
              ) : (
                <button className="btn lg" onClick={() => act({ type: 'pause' })}>
                  <Icon name="pause" /> Pause
                </button>
              )}
              <button className="btn lg" onClick={() => act({ type: 'addTime', seconds: 30 })}>
                +30s
              </button>
            </>
          )}
          {phase === 'registration' &&
            (registrationOpen ? (
              <button className="btn lg" onClick={() => act({ type: 'lockRegistration' })}>
                <Icon name="lock" /> Lock registration
              </button>
            ) : (
              <button className="btn lg" onClick={() => act({ type: 'openRegistration' })}>
                Open registration
              </button>
            ))}
        </div>
        <div className="row">
          <a className="btn sm" href={`/api/export/players.csv?key=${encodeURIComponent(hostKey)}`} aria-disabled={!view.rounds[1]}>
            <Icon name="download" size="sm" /> Players CSV
          </a>
          <a className="btn sm" href={`/api/export/market.csv?key=${encodeURIComponent(hostKey)}`}>
            <Icon name="download" size="sm" /> Market CSV
          </a>
          {confirmReset ? (
            <>
              <button className="btn sm danger" onClick={() => { act({ type: 'reset' }); setConfirmReset(false); }}>
                Confirm reset: wipes this session
              </button>
              <button className="btn sm ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn sm danger" onClick={() => setConfirmReset(true)}>
              New session / reset
            </button>
          )}
        </div>
      </div>
      {phase === 'registration' && <Settings view={view} act={act} />}
    </section>
  );
}

function Settings({ view, act }: { view: HostView; act: (a: HostAction) => void }) {
  const [r1, setR1] = useState(view.session.r1Seconds);
  const [r2, setR2] = useState(view.session.r2Seconds);
  useEffect(() => setR1(view.session.r1Seconds), [view.session.r1Seconds]);
  useEffect(() => setR2(view.session.r2Seconds), [view.session.r2Seconds]);
  return (
    <div className="row wrap" style={{ gap: 22, color: 'var(--text-2)', fontSize: 14 }}>
      <label className="row" style={{ gap: 8 }}>
        Round 1 timer
        <input className="num-input" type="number" min={15} max={1200} value={r1} onChange={(e) => setR1(Number(e.target.value))} onBlur={() => act({ type: 'setDuration', round: 1, seconds: r1 })} />s
      </label>
      <label className="row" style={{ gap: 8 }}>
        Round 2 timer
        <input className="num-input" type="number" min={15} max={1200} value={r2} onChange={(e) => setR2(Number(e.target.value))} onBlur={() => act({ type: 'setDuration', round: 2, seconds: r2 })} />s
      </label>
      <label className="toggle">
        <input type="checkbox" checked={view.session.autoReveal} onChange={(e) => act({ type: 'setAutoReveal', value: e.target.checked })} />
        Show results to participants as soon as the market clears
      </label>
      <span className="row" style={{ gap: 8 }}>
        <span className="eyebrow">Demo market</span>
        {[10, 20, 50].map((n) => (
          <button key={n} className="btn sm" onClick={() => act({ type: 'loadDemo', count: n })} disabled={view.counts.humans >= view.counts.maxHumans}>
            + {n} simulated
          </button>
        ))}
      </span>
    </div>
  );
}

function useQr(url: string) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#14172b', light: '#ffffff' } }).then(setSvg);
  }, [url]);
  return svg;
}

function JoinPanel({ view }: { view: HostView }) {
  const url = `${location.origin}/?code=${view.session.code}`;
  const svg = useQr(url);
  const [full, setFull] = useState(false);
  return (
    <section className="card qr-panel">
      <button className="qr-box" onClick={() => setFull(true)} aria-label="Show QR code full screen" style={{ border: 0, cursor: 'zoom-in' }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="stack">
        <span className="eyebrow">Join from your phone</span>
        <span className="join-url">{location.host}</span>
        <div className="stack-sm">
          <span className="eyebrow">Session code</span>
          <span className="bigcode">{view.session.code}</span>
        </div>
        <p className="muted">
          {view.session.registrationOpen ? 'Registration is open. Every participant plays their own company in one shared market.' : 'Registration closed.'}
        </p>
        <div>
          <button className="btn" onClick={() => setFull(true)}>
            <Icon name="expand" /> Show QR full screen
          </button>
        </div>
      </div>
      {full && (
        <div className="overlay" onClick={() => setFull(false)} role="dialog" aria-label="Join QR code">
          <div className="stack" style={{ justifyItems: 'center', textAlign: 'center' }}>
            <div className="hero" style={{ padding: 0 }}>
              <h1 className="display" style={{ fontSize: 56 }}>
                The Pricing <em>War Room</em>
              </h1>
            </div>
            <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
            <span className="join-url" style={{ fontSize: 28 }}>
              {location.host} · code <b style={{ letterSpacing: '0.16em' }}>{view.session.code}</b>
            </span>
            <span className="pill live">
              <span className="dot" /> {view.counts.humans} CEOs in the room · click anywhere to close
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function Participants({ view, act, round }: { view: HostView; act: (a: HostAction) => void; round: 1 | 2 | null }) {
  const canRemove = view.session.phase === 'registration';
  return (
    <section className="card pad">
      <div className="section-title">
        <h2>Participants</h2>
        <span className="eyebrow">
          {view.counts.humans} / {view.counts.maxHumans}
        </span>
      </div>
      {view.players.length === 0 ? (
        <p className="muted">No one has joined yet. Put the QR code on screen.</p>
      ) : (
        <div className="plist">
          {view.players.map((p) => {
            const submitted = round ? view.players.find((x) => x.id === p.id)?.decisions[round] !== undefined : false;
            return (
              <div key={p.id} className="pcard">
                {p.isDemo ? (
                  <span className="tag" title="Simulated participant">sim</span>
                ) : (
                  <span className={`conn${p.connected ? ' on' : ''}`} title={p.connected ? 'Connected' : 'Offline'} />
                )}
                <span className="who">
                  <b>{p.name}</b>
                  <span>
                    {p.marketIndex !== null && <span className="mkt">M{p.marketIndex + 1}</span>} {p.company} ({p.letter}) · {p.codename}
                  </span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {round === 2 && (
                    <span className="subm" title={p.guess ? `Named ${p.guess.company}` : 'Has not answered the quiz yet'}>
                      {p.guess ? (p.guess.correct ? <span className="ok">Quiz <Icon name="check" size="sm" /></span> : <span className="no">Quiz <Icon name="x" size="sm" /></span>) : 'Quiz …'}
                    </span>
                  )}
                  {round && <span className={`subm${submitted ? ' yes' : ''}`}>{submitted ? <><Icon name="check" size="sm" /> In</> : '…'}</span>}
                  {p.isDemo && p.token && (
                    <a className="subm" href={`/?as=${encodeURIComponent(p.token)}`} target="_blank" rel="noreferrer" title="Preview this demo participant's screen">
                      view
                    </a>
                  )}
                  {canRemove && (
                    <button className="subm" style={{ background: 'none', cursor: 'pointer' }} onClick={() => act({ type: 'removePlayer', playerId: p.id })} aria-label={`Remove ${p.name}`}>
                      <Icon name="x" size="sm" />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RoundLive({ view }: { view: HostView }) {
  const round = view.session.phase === 'r1_decision' ? 1 : 2;
  const { remainingMs, paused } = useCountdown(view.session.timer, view.serverNow);
  const c = view.counts;
  return (
    <section className="live-card">
      <span className="eyebrow">Round {round} · decisions open</span>
      <span className={`bigclock${remainingMs < 20000 && !paused ? ' urgent' : ''}`} role="timer">
        {paused ? `Paused · ${clock(remainingMs)}` : clock(remainingMs)}
      </span>
      <p className="display" style={{ fontSize: 30 }}>
        {c.submissions} of {c.expectedSubmissions} CEOs have locked a price
      </p>
      <div className="progress" style={{ width: '100%', maxWidth: 640 }}>
        <i style={{ width: `${c.expectedSubmissions ? (c.submissions / c.expectedSubmissions) * 100 : 0}%` }} />
      </div>
      {round === 2 && (
        <p className="eyebrow">
          {c.guesses} of {c.expectedSubmissions} have named their primary competitor
        </p>
      )}
      <p className="muted">
        {round === 1
          ? 'Missing decisions default to QAR 1,000 when the timer ends.'
          : 'Each participant names their Round 1 primary competitor, sees the real customer flows and a best-response table, then locks a price. Missing decisions keep their Round 1 price.'}
      </p>
    </section>
  );
}

function AiTable({ view }: { view: HostView }) {
  if (!view.ai.length) return null;
  return (
    <details className="fold">
      <summary>
        <span>
          <span className="eyebrow">AI competitors</span>
          <br />
          <span style={{ fontWeight: 600 }}>
            {view.ai.length} AI compan{view.ai.length === 1 ? 'y' : 'ies'} filling empty archetypes
          </span>
        </span>
      </summary>
      <div className="body scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Market</th>
              <th>Company</th>
              <th>Archetype</th>
              <th>Personality</th>
              <th className="r">VC</th>
              <th className="r">FC</th>
              <th className="r">Right price</th>
              <th className="r">R1</th>
              <th className="r">R2</th>
            </tr>
          </thead>
          <tbody>
            {view.ai.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="mkt">M{a.marketIndex + 1}</span>
                </td>
                <td>{a.name}</td>
                <td className="muted">
                  {a.letter} · {a.archetype}
                </td>
                <td className="muted">{a.personality}</td>
                <td className="r">{int(a.vc)}</td>
                <td className="r">{int(a.fc)}</td>
                <td className="r">{int(a.rightPrice)}</td>
                <td className="r">{a.decisions[1] ?? '·'}</td>
                <td className="r">{a.decisions[2] ?? '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function PhaseBody({ view, act }: { view: HostView; act: (a: HostAction) => void }) {
  const { phase } = view.session;
  switch (phase) {
    case 'registration':
      return (
        <div className="stack-lg">
          <JoinPanel view={view} />
          <Participants view={view} act={act} round={null} />
        </div>
      );
    case 'r1_decision':
    case 'r2_decision':
      return (
        <div className="stack-lg">
          <RoundLive view={view} />
          <Participants view={view} act={act} round={phase === 'r1_decision' ? 1 : 2} />
          <AiTable view={view} />
        </div>
      );
    case 'r1_clearing':
    case 'r2_clearing':
      return (
        <div className="stack-lg">
          <section className="card pad row" style={{ gap: 18 }}>
            <div className="radar" aria-hidden="true" />
            <div className="stack-sm">
              <h2 className="display" style={{ fontSize: 30 }}>
                Market cleared.
              </h2>
              <p className="muted">Participants are waiting. Press “Reveal” to send each CEO their private results.</p>
            </div>
          </section>
          <RoundSummary view={view} round={phase === 'r1_clearing' ? 1 : 2} />
        </div>
      );
    case 'r1_results':
    case 'workshop':
      return (
        <div className="stack-lg">
          {phase === 'workshop' && (
            <p className="callout">
              Workshop in progress. Participants keep their Round 1 results on screen. Start Round 2 when you are ready.
            </p>
          )}
          <RoundSummary view={view} round={1} />
          <AiTable view={view} />
        </div>
      );
    case 'r2_results':
      return (
        <div className="stack-lg">
          <RoundSummary view={view} round={2} />
          {view.debrief && <Debrief view={view} />}
        </div>
      );
    case 'debrief':
      return view.debrief ? <Debrief view={view} /> : null;
  }
}
