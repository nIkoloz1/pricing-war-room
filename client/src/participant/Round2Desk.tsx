import { useState, type ReactNode } from 'react';
import type { PlayerView, Price, Round2Desk as Desk } from '../../../shared/types';
import { int, money, moveLabel, pts } from '../lib';
import { PricePicker, Similarity, TimerBar } from '../ui/common';
import { Icon } from '../ui/icons';
import { DossierFold } from './Dossier';
import { CompetitorBoard, FlowList } from './Results';

function Step({ n, state, title, children }: { n: number; state: 'now' | 'done' | 'wait'; title: string; children: ReactNode }) {
  return (
    <section className="card pad stack" aria-label={title}>
      <div className="step-head">
        <span className={`step-no${state === 'done' ? ' done' : state === 'wait' ? ' wait' : ''}`}>{state === 'done' ? <Icon name="check" size="sm" /> : n}</span>
        <h2 className="display" style={{ fontSize: 22 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Quiz({ desk, busy, onGuess }: { desk: Desk; busy: boolean; onGuess: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const answered = desk.guess !== null;
  const truth = desk.reveal?.primaryId;
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 15 }}>
        Which competitor moved the most customers to or from you in Round 1? Think <b style={{ color: 'var(--text)' }}>similarity × price gap</b>: a
        close rival with a big price difference moves many customers; a distant one barely any.
      </p>
      <div className="quiz" role="group" aria-label="Choose your primary competitor">
        {desk.options.map((o) => {
          const cls = answered ? (o.id === truth ? ' correct' : o.id === desk.guess ? ' wrong' : '') : '';
          return (
            <button
              key={o.id}
              type="button"
              className={`qopt${cls}`}
              aria-pressed={answered ? o.id === desk.guess : sel === o.id}
              disabled={answered || busy}
              onClick={() => setSel(o.id)}
            >
              <span className="co">{o.company}</span>
              <span className="tick">
                {answered && o.id === truth ? <><Icon name="check" size="sm" /> Primary</> : answered && o.id === desk.guess ? <><Icon name="x" size="sm" /> Your pick</> : ''}
              </span>
              <span className="meta">
                <span>{o.segment}</span>
                <Similarity value={o.similarity} />
                <span>
                  R1 price <b style={{ color: 'var(--text-2)' }}>QAR {int(o.r1Price)}</b> ({moveLabel(o.r1Price)})
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!answered && (
        <button className="btn primary lg block" disabled={!sel || busy} onClick={() => sel && onGuess(sel)}>
          {busy ? 'Checking…' : sel ? 'Lock in my answer' : 'Pick one competitor'}
        </button>
      )}
    </div>
  );
}

function Reveal({ desk }: { desk: Desk }) {
  const rv = desk.reveal!;
  return (
    <div className="stack">
      <div className={`result-banner ${rv.correct ? 'good' : 'bad'}`} role="status">
        <strong>{rv.correct ? 'Correct.' : desk.guess ? 'Not quite.' : 'Time ran out.'}</strong>
        <span>
          Your primary competitor in Round 1 was <b>{rv.primaryCompany}</b>.
        </span>
      </div>
      <span className="eyebrow">Round 1 customer flows</span>
      <FlowList flows={rv.flows} highlightId={rv.primaryId} />
    </div>
  );
}

function BestResponse({ desk, myR1Price }: { desk: Desk; myR1Price: Price }) {
  const t = desk.reveal!.table;
  return (
    <div className="stack">
      <p className="muted" style={{ fontSize: 15 }}>
        If everyone else keeps their Round 1 price, here is your best price for each move <b style={{ color: 'var(--text)' }}>{t.rivalCompany}</b>{' '}
        might make.
      </p>
      <table className="brtable">
        <thead>
          <tr>
            <th scope="col">{t.rivalCompany} charges</th>
            <th scope="col">Your best price</th>
            <th scope="col">Your profit</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.rivalPrice} className={r.rivalPrice === t.rivalR1Price ? 'now' : undefined}>
              <td>
                QAR {int(r.rivalPrice)}
                {r.rivalPrice === t.rivalR1Price && <span className="faint" style={{ display: 'block', fontSize: 11.5, fontWeight: 400 }}>their R1 price</span>}
              </td>
              <td>
                <b>{int(r.bestPrice)}</b>
                {r.bestPrice === myR1Price && <span className="faint" style={{ display: 'block', fontSize: 11.5, fontWeight: 400 }}>= your R1 price</span>}
              </td>
              <td>{money(r.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="callout" style={{ fontSize: 17 }}>
        {t.reactionPer100 === 0
          ? `Each QAR 100 they move barely shifts your best price: you are differentiated from ${t.rivalCompany}.`
          : `Each QAR 100 ${t.rivalCompany} moves shifts your best price by about QAR ${t.reactionPer100}.`}
      </p>
    </div>
  );
}

export function Round2DeskScreen({
  view,
  busy,
  onLock,
  onGuess,
  error,
}: {
  view: PlayerView;
  busy: boolean;
  onLock: (p: Price) => void;
  onGuess: (id: string) => void;
  error: ReactNode;
}) {
  const r1 = view.me.results[1];
  const desk = view.desk;
  if (!r1 || !desk) return null;
  const answered = desk.guess !== null;
  return (
    <div className="stack-lg">
      <TimerBar timer={view.session.timer} serverNow={view.serverNow} label="Round 2" />
      <header className="stack-sm">
        <span className="eyebrow brass">Round 2 · {view.me.profile.company}</span>
        <h1 className="display" style={{ fontSize: 40 }}>
          Same company.
          <br />
          <em style={{ color: 'var(--violet)', fontStyle: 'normal' }}>New information.</em>
        </h1>
      </header>

      <section className="startcard" aria-label="Your Round 1">
        <div>
          <span className="k">R1 price</span>
          <span className="v">QAR {int(r1.price)}</span>
        </div>
        <div>
          <span className="k">R1 profit</span>
          <span className="v" style={r1.profit < 0 ? { color: 'var(--neg)' } : undefined}>
            {money(r1.profit)}
          </span>
        </div>
        <div>
          <span className="k">Customers</span>
          <span className="v">{int(r1.units)}</span>
        </div>
        <div>
          <span className="k">Share vs start</span>
          <span className="v">{pts(r1.shareChangePp)}</span>
        </div>
      </section>

      <CompetitorBoard rows={r1.competitors} title="Round 1 prices" highlightId={desk.reveal?.primaryId} />

      {error}

      <Step n={1} state={answered ? 'done' : 'now'} title="Who was your primary competitor?">
        <Quiz desk={desk} busy={busy} onGuess={onGuess} />
        {desk.reveal && <Reveal desk={desk} />}
      </Step>

      <Step n={2} state={desk.reveal ? 'done' : 'wait'} title="Your best response">
        {desk.reveal ? <BestResponse desk={desk} myR1Price={r1.price} /> : <p className="faint">Unlocks after you answer step 1.</p>}
      </Step>

      <Step n={3} state={answered ? 'now' : 'wait'} title="Set your Round 2 price">
        <PricePicker onLock={onLock} busy={busy} previous={r1.price} lockedReason={answered ? undefined : 'Answer step 1 to unlock the price grid.'} />
      </Step>

      <DossierFold profile={view.me.profile} codename={view.me.codename} />
    </div>
  );
}
