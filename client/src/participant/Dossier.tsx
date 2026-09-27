import { useState } from 'react';
import type { CompanyProfile } from '../../../shared/types';
import { int, pct, store } from '../lib';

export function Dossier({ profile: p, codename }: { profile: CompanyProfile; codename: string }) {
  const dropPer50 = Math.round(50 * p.customersPerQar);
  const clvAt1000 = (1000 - p.vc) / p.churn;
  const custAt1000 = p.demandTable.find((r) => r.price === 1000)?.customers ?? p.startCustomers;
  const half = Math.ceil(p.demandTable.length / 2);
  const cols = [p.demandTable.slice(0, half), p.demandTable.slice(half)];

  return (
    <article className="dossier stack" aria-label="Your confidential company dossier">
      <div className="row between">
        <span className="eyebrow">Dossier {p.letter}</span>
        <span className="stamp" aria-hidden="true">
          CONFIDENTIAL
        </span>
      </div>
      <div className="stack-sm">
        <h2 className="company">{p.company}</h2>
        <p className="product">{p.product}</p>
        <span className="eyebrow" style={{ fontSize: 11 }}>
          {p.segment} · {p.archetype} · CEO {codename}
        </span>
      </div>

      <div className="facts">
        <div className="fact">
          <span className="k">Price today</span>
          <span className="v">QAR {int(1000)}</span>
          <span className="s">per customer / month</span>
        </div>
        <div className="fact">
          <span className="k">Customers today</span>
          <span className="v">{int(p.startCustomers)}</span>
          <span className="s">at the going rate</span>
        </div>
        <div className="fact">
          <span className="k">Variable cost</span>
          <span className="v">QAR {int(p.vc)}</span>
          <span className="s">per customer / month</span>
        </div>
        <div className="fact">
          <span className="k">Fixed cost</span>
          <span className="v">QAR {int(p.fc)}</span>
          <span className="s">per month</span>
        </div>
      </div>

      <div className="stack-sm">
        <span className="eyebrow">Competitive position</span>
        <p style={{ fontSize: 15.5 }}>{p.positionText}</p>
      </div>
      <p className="note">“{p.founderNote}”</p>
      <hr />

      <section className="stack-sm" aria-label="Economic value">
        <span className="eyebrow">Economic value to your best-fit customer</span>
        <div className="ledger">
          <div className="ln">
            <span>Reference: the going market rate</span>
            <span>{int(p.eve.reference)}</span>
          </div>
          <div className="ln plus">
            <span>+ {p.eve.plus.label}</span>
            <span>+{int(p.eve.plus.amount)}</span>
          </div>
          <div className="ln minus">
            <span>− {p.eve.minus.label}</span>
            <span>−{int(p.eve.minus.amount)}</span>
          </div>
          <div className="ln total">
            <span>= Max willingness to pay</span>
            <span>QAR {int(p.maxWtp)}</span>
          </div>
        </div>
        <p className="paper-note">
          This is the most your best-fit customer would pay. Customers differ: below that, willingness to pay is spread evenly.
          Every <b>QAR 50</b> you raise, about <b>{dropPer50} customers</b> drop off. <b>{pct(p.switchShare, 0)}</b> of them go to
          similar competitors; the rest stop buying.
        </p>
      </section>

      <section className="stack-sm" aria-label="Demand table">
        <span className="eyebrow">Your demand, if competitors stay at QAR 1,000</span>
        <div className="dtable">
          {cols.map((col, i) => (
            <table key={i}>
              <thead>
                <tr>
                  <th scope="col">Price</th>
                  <th scope="col">Customers</th>
                </tr>
              </thead>
              <tbody>
                {col.map((r) => (
                  <tr key={r.price} className={r.price === 1000 ? 'hl' : r.customers === 0 ? 'zero' : undefined}>
                    <td>{int(r.price)}</td>
                    <td>{r.customers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
        <p className="paper-note">Profit is yours to work out: customers × (price − variable cost) − fixed cost.</p>
      </section>

      <section className="clv" aria-label="Customer lifetime value">
        <span className="eyebrow">Customer lifetime value</span>
        <span>
          Your customers churn <b>{pct(p.churn, 1)}</b> a month.
        </span>
        <span className="eq">CLV = (price − variable cost) ÷ churn</span>
        <span className="ex">
          At QAR 1,000: ({int(1000)} − {int(p.vc)}) ÷ {pct(p.churn, 1)} = QAR {int(clvAt1000)} per customer
          <br />
          {custAt1000} customers × {int(clvAt1000)} = QAR {int(custAt1000 * clvAt1000)} of lifetime value
        </span>
        <p className="paper-note">
          CLV method: pick the price where <b>customers × CLV</b> is highest. With steady churn that lands on the same price as
          maximising monthly contribution, so both methods should agree.
        </p>
      </section>

      <section className="methods" aria-label="Two routes to a price">
        <span className="eyebrow">Two routes to your price</span>
        <div className="method">
          <span className="n">1</span>
          <span>
            <b>Value route.</b> If competitors don’t move, your right price is about halfway between your max willingness to pay
            (QAR {int(p.maxWtp)}) and your variable cost (QAR {int(p.vc)}).
          </span>
        </div>
        <div className="method">
          <span className="n">2</span>
          <span>
            <b>CLV route.</b> For each row of the demand table, customers × CLV. The highest row is your price.
          </span>
        </div>
      </section>

      <div className="objective">
        <span className="eyebrow">Objective</span>
        <strong>Maximise monthly operating profit.</strong>
        <span style={{ fontSize: 13.5, opacity: 0.8 }}>We also track how much market share you gain or lose from where you started.</span>
      </div>
    </article>
  );
}

/** Sealed folder that opens into the dossier (remembered per player). */
export function Briefcase({ profile, codename, playerId }: { profile: CompanyProfile; codename: string; playerId: string }) {
  const key = `pwr.opened.${playerId}`;
  const [open, setOpen] = useState(() => store.get(key) === '1');
  if (!open) {
    return (
      <button
        className="sealed"
        onClick={() => {
          store.set(key, '1');
          setOpen(true);
        }}
      >
        <span className="eyebrow" style={{ color: '#d9b77e' }}>
          Eyes only · {codename}
        </span>
        <span className="seal" aria-hidden="true">
          {profile.letter}
        </span>
        <span className="display">Your company dossier</span>
        <span style={{ color: '#d9c3a0', fontSize: 15 }}>
          The information inside is yours alone. Do not show it to other participants.
        </span>
        <span className="btn primary" style={{ marginTop: 6 }}>
          Break the seal
        </span>
      </button>
    );
  }
  return (
    <div className="open-in">
      <Dossier profile={profile} codename={codename} />
    </div>
  );
}

export function DossierChips({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="chips">
      <span className="chip">
        Max WTP <b>{int(profile.maxWtp)}</b>
      </span>
      <span className="chip">
        Var. cost <b>{int(profile.vc)}</b>
      </span>
      <span className="chip">
        Fixed <b>{int(profile.fc)}</b>
      </span>
      <span className="chip">
        Churn <b>{pct(profile.churn, 1)}</b>
      </span>
    </div>
  );
}

/** The dossier tucked into a fold, for decision screens. */
export function DossierFold({ profile, codename }: { profile: CompanyProfile; codename: string }) {
  return (
    <details className="fold">
      <summary>
        <span className="stack-sm">
          <span className="eyebrow">Your dossier · tap to open</span>
          <DossierChips profile={profile} />
        </span>
      </summary>
      <div className="body" style={{ padding: 0 }}>
        <Dossier profile={profile} codename={codename} />
      </div>
    </details>
  );
}

export function MarketBrief() {
  return (
    <details className="fold">
      <summary>
        <span>
          <span className="eyebrow brass">Participant brief</span>
          <br />
          <span style={{ fontWeight: 600 }}>The market you are entering</span>
        </span>
      </summary>
      <div className="body">
        <p>
          You are the founder and CEO of an AI business-software company in Qatar and the GCC. Your market has ten companies, each
          selling to its own kind of customer.
        </p>
        <p>
          Some competitors sell almost the same thing to the same buyers: if they undercut you, your customers can switch. Others
          are so different that their price barely touches you.
        </p>
        <p>
          Every company starts at <b style={{ color: 'var(--text)' }}>QAR 1,000 / month</b>. You choose once per round, at the same
          time as everyone else, from QAR 700 to QAR 1,450.
        </p>
        <p style={{ color: 'var(--text)' }}>
          You are scored on profit, and on how much market share you gain or lose from where you started.
        </p>
      </div>
    </details>
  );
}
