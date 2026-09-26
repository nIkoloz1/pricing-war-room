import { useEffect, useRef } from 'react';
import { PRICE_OPTIONS, type CompanyProfile } from '../../../shared/types';
import { int, pct } from '../lib';

/** The concise workshop cheat sheet, filled in with the player's own numbers. */
export function StrategySheet({ profile, onClose }: { profile: CompanyProfile; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const cm = (p: number) => (p - profile.variableCost) / p;
  const base = 1000;
  const cmBase = cm(base);
  const bev = (p: number) => {
    const dp = (p - base) / base;
    return -dp / (cmBase + dp);
  };
  const churn = 0.02;
  const clv = (base * cmBase) / churn;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="dossier stack">
          <div className="row between">
            <div className="stack-sm">
              <span className="eyebrow">From today's workshop</span>
              <h2 id="sheet-title" className="company" style={{ fontSize: 30 }}>
                Strategy sheet
              </h2>
            </div>
            <button ref={closeRef} className="btn sm" style={{ background: 'var(--paper-ink)', color: 'var(--paper)', borderColor: 'var(--paper-ink)' }} onClick={onClose}>
              Close
            </button>
          </div>

          <div>
            <div className="formula">
              <span className="name">Contribution margin</span>
              <span className="eq">(price − variable cost) ÷ price</span>
              <span className="you">
                You at QAR 1,000: <b>{pct(cmBase, 0)}</b> of every sale is left to cover fixed costs and profit.
              </span>
            </div>

            <div className="formula">
              <span className="name">Break-even volume change</span>
              <span className="eq">−ΔPrice ÷ (margin + ΔPrice)</span>
              <table className="bev">
                <thead>
                  <tr>
                    <th>Your price</th>
                    <th>Margin</th>
                    <th>Value ×</th>
                    <th>Customers to break even</th>
                  </tr>
                </thead>
                <tbody>
                  {PRICE_OPTIONS.map((p) => (
                    <tr key={p} style={p === base ? { fontWeight: 600 } : undefined}>
                      <td>QAR {int(p)}</td>
                      <td>{pct(cm(p), 0)}</td>
                      <td>{(profile.customerValue / p).toFixed(2)}×</td>
                      <td>{p === base ? 'baseline' : p < base ? `gain ≥ +${pct(bev(p), 0)}` : `lose ≤ ${pct(-bev(p), 0)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="formula">
              <span className="name">Value multiple</span>
              <span className="eq">customer value ÷ price</span>
              <span className="you">
                Your customers get about <b>QAR {int(profile.customerValue)}</b> of value a month. Above 1×, customers keep part of
                the value as a reason to buy from you.
              </span>
            </div>

            <div className="formula">
              <span className="name">Elasticity</span>
              <span className="eq">% change in volume ÷ % change in price</span>
              <span className="you">
                Your customers: <b>{profile.sensitivityLabel.toLowerCase()} sensitivity</b> (≈ {profile.elasticity.toFixed(1)}). Above 1
                is elastic: volume reacts more than price. Below or near 1: volume barely moves.
              </span>
            </div>

            <div className="formula">
              <span className="name">Customer lifetime value</span>
              <span className="eq">monthly revenue × gross margin ÷ monthly churn</span>
              <span className="you">
                Illustration at QAR 1,000 and 2% churn: <b>QAR {int(clv)}</b> per customer. Price moves lifetime value as well as
                this month.
              </span>
            </div>

            <div className="formula">
              <span className="name">Game theory</span>
              <span className="eq">Your payoff depends on your decision and the decisions of competitors.</span>
              <span className="you">
                If one company cuts, it gains share. If everyone cuts, share barely moves and everyone earns less margin.
              </span>
            </div>
          </div>

          <p className="closing">
            Your company has not changed.
            <br />
            <em>Your information has.</em>
          </p>
        </div>
      </div>
    </>
  );
}
