import { useState } from 'react';
import type { CompanyProfile } from '../../../shared/types';
import { int, store } from '../lib';

export function Dossier({ profile, codename }: { profile: CompanyProfile; codename: string }) {
  return (
    <article className="dossier stack" aria-label="Your confidential company dossier">
      <div className="row between">
        <span className="eyebrow">Dossier {profile.dossier}</span>
        <span className="stamp" aria-hidden="true">
          CONFIDENTIAL
        </span>
      </div>
      <div className="stack-sm">
        <h2 className="company">{profile.company}</h2>
        <p className="product">{profile.product}</p>
        <span className="eyebrow" style={{ fontSize: 11 }}>
          {profile.archetype} · CEO {codename}
        </span>
      </div>

      <div className="facts">
        <div className="fact">
          <span className="k">Current price</span>
          <span className="v">QAR {int(1000)}</span>
          <span className="s">per customer / month</span>
        </div>
        <div className="fact">
          <span className="k">Customer value</span>
          <span className="v">QAR {int(profile.customerValue)}</span>
          <span className="s">value created / month</span>
        </div>
        <div className="fact">
          <span className="k">Price sensitivity</span>
          <span className="v">{profile.sensitivityLabel}</span>
          <span className="s">elasticity ≈ {profile.elasticity.toFixed(1)}</span>
        </div>
        <div className="fact">
          <span className="k">Variable cost</span>
          <span className="v">QAR {int(profile.variableCost)}</span>
          <span className="s">per customer / month</span>
        </div>
        <div className="fact wide">
          <span className="k">Fixed cost</span>
          <span className="v">QAR {int(profile.fixedCost)}</span>
          <span className="s">per month, regardless of customers</span>
        </div>
      </div>

      <div className="stack-sm">
        <span className="eyebrow">Competitive position</span>
        <p style={{ fontSize: 15.5 }}>{profile.position}</p>
      </div>
      <p className="note">“{profile.founderNote}”</p>
      <hr />
      <div className="objective">
        <span className="eyebrow">Objective</span>
        <strong>Maximize your monthly operating profit.</strong>
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
          {profile.dossier}
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
        Value <b>{int(profile.customerValue)}</b>
      </span>
      <span className="chip">
        Sensitivity <b>{profile.sensitivityLabel}</b>
      </span>
      <span className="chip">
        Var. cost <b>{int(profile.variableCost)}</b>
      </span>
      <span className="chip">
        Fixed <b>{int(profile.fixedCost)}</b>
      </span>
    </div>
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
          You are the founder and CEO of an AI business-software company competing across Qatar and the GCC. Customers compare
          vendors on price and on the value they expect to get.
        </p>
        <p>
          The market has roughly <b style={{ color: 'var(--text)' }}>100 customers per competitor</b> at today's prices. Lower prices
          across the market attract some extra customers; higher prices lose some. Demand does not move one-for-one with price.
        </p>
        <p>
          You do not know how many competitors there are, what they will charge, or their costs. Some chase market share, others
          protect margin, and some can justify a premium.
        </p>
        <p>
          Every company starts at <b style={{ color: 'var(--text)' }}>QAR 1,000 / month</b>. You choose once, at the same time as
          everyone else, and you cannot change it afterwards.
        </p>
        <p style={{ color: 'var(--text)' }}>There is no single correct answer. Your competitors' decisions matter.</p>
      </div>
    </details>
  );
}
