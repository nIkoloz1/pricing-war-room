import { PRICE_OPTIONS, type CompanyProfile, type Letter } from '../../../shared/types';
import { COMPANIES, type CompanyData } from './companies';
import { COEF, dossierCustomers } from './market';
import { REFERENCE_PRICE } from './params';

// The confidential dossier a participant sees, derived from the company data and engine.
function toProfile(c: CompanyData): CompanyProfile {
  const k = COEF[c.letter];
  return {
    id: c.id,
    letter: c.letter,
    archetype: c.archetype,
    company: c.company,
    product: c.product,
    segment: c.segment,
    positionText: c.positionText,
    founderNote: c.founderNote,
    position: c.position,
    vc: c.vc,
    fc: c.fc,
    rightPrice: c.rightPrice,
    startCustomers: c.startCustomers,
    churn: c.churn,
    maxWtp: Math.round(k.maxWtp),
    eve: { reference: REFERENCE_PRICE, plus: c.evePlus, minus: c.eveMinus },
    customersPerQar: k.T,
    switchShare: k.switchShare,
    demandTable: PRICE_OPTIONS.map((price) => ({ price, customers: dossierCustomers(c.letter, price) })),
  };
}

export const PROFILES: CompanyProfile[] = COMPANIES.map(toProfile);

export const PROFILE_BY_ID: Record<string, CompanyProfile> = Object.fromEntries(PROFILES.map((p) => [p.id, p]));
export const PROFILE_BY_LETTER = Object.fromEntries(PROFILES.map((p) => [p.letter, p])) as Record<Letter, CompanyProfile>;

const CODENAME_WORDS = [
  'Falcon', 'Onyx', 'Cobalt', 'Saffron', 'Harbor', 'Mirage', 'Cedar', 'Dune', 'Atlas', 'Ember',
  'Pearl', 'Oryx', 'Zenith', 'Lantern', 'Quartz', 'Monsoon', 'Sable', 'Vector', 'Obsidian', 'Meridian',
  'Granite', 'Sirocco', 'Nimbus', 'Indigo', 'Corsair',
];

export function codenameFor(index: number, rand: () => number): string {
  const word = CODENAME_WORDS[Math.floor(rand() * CODENAME_WORDS.length)];
  return `${word}-${String(index + 1).padStart(2, '0')}`;
}
