import type { Letter } from '../../../shared/types';

// ============================================================================
//  The ten companies. Every market contains exactly one of each.
//  Human players and AI fills use identical economics; only the name differs.
//  Derived demand coefficients are computed from these in ./market.ts.
// ============================================================================

export type Personality =
  | 'premium-leader'
  | 'aggressive-challenger'
  | 'stable-operator'
  | 'value-specialist'
  | 'low-cost'
  | 'retaliator'
  | 'market-follower'
  | 'growth-seeker'
  | 'margin-defender'
  | 'adaptive';

export interface CompanyData {
  letter: Letter;
  id: string;
  company: string; // name when a human plays it
  archetype: string;
  segment: string;
  product: string;
  positionText: string;
  founderNote: string;
  vc: number; // variable cost per customer / month
  fc: number; // fixed cost / month
  rightPrice: number; // dossier right price (rivals at 1,000)
  startCustomers: number; // q0: customers when everyone charges 1,000
  churn: number; // monthly churn
  position: { x: number; y: number }; // map position; closer = more similar
  evePlus: { label: string; amount: number };
  eveMinus: { label: string; amount: number };
  aiName: string;
  personality: Personality;
}

export const COMPANIES: CompanyData[] = [
  {
    letter: 'A',
    id: 'premium-specialist',
    company: 'Lumina AI',
    archetype: 'Premium Specialist',
    segment: 'Enterprise, regulated',
    product: 'AI workflow platform for regulated businesses',
    positionText:
      'Customers see Lumina as a premium solution with strong reliability and implementation support. Customers care about price, but switching away from Lumina carries a meaningful operational risk.',
    founderNote: 'You believe your product creates significantly more value than the average competitor.',
    vc: 380, fc: 35000, rightPrice: 1200, startCustomers: 115, churn: 0.02,
    position: { x: 0.62, y: 0.5 },
    evePlus: { label: 'Compliance and audit hours saved', amount: 1150 },
    eveMinus: { label: 'Onboarding effort', amount: 130 },
    aiName: 'Sidra Intelligence', personality: 'premium-leader',
  },
  {
    letter: 'B',
    id: 'efficient-challenger',
    company: 'SwiftOps',
    archetype: 'Efficient Challenger',
    segment: 'SMB self-serve',
    product: 'AI automation platform for growing businesses',
    positionText:
      'You entered the market later than established players. Your product is simpler, but your cost structure is efficient, and several rivals sell almost the same thing to the same small businesses.',
    founderNote: 'You are willing to trade some margin for growth.',
    vc: 220, fc: 25000, rightPrice: 850, startCustomers: 110, churn: 0.04,
    position: { x: -0.45, y: -0.62 },
    evePlus: { label: 'Faster setup', amount: 600 },
    eveMinus: { label: 'Fewer features', amount: 120 },
    aiName: 'Rocket Stack', personality: 'aggressive-challenger',
  },
  {
    letter: 'C',
    id: 'enterprise-solution',
    company: 'Atlas Enterprise AI',
    archetype: 'Enterprise Solution',
    segment: 'Enterprise',
    product: 'Enterprise AI operations platform',
    positionText:
      'Your product is designed for larger organizations with complex requirements. Customers value reliability, integration and support. You have higher costs than most competitors.',
    founderNote: 'Winning the right customers matters more than being the cheapest provider.',
    vc: 420, fc: 42000, rightPrice: 1250, startCustomers: 145, churn: 0.015,
    position: { x: -0.4, y: 0.78 },
    evePlus: { label: 'Integration and reliability at scale', amount: 1300 },
    eveMinus: { label: 'Long implementation', amount: 220 },
    aiName: 'Qamar Analytics', personality: 'value-specialist',
  },
  {
    letter: 'D',
    id: 'balanced-saas',
    company: 'NexaFlow',
    archetype: 'Balanced SaaS',
    segment: 'Mid-market',
    product: 'AI business operations platform',
    positionText:
      'You are a credible middle-market player. Your product is neither the cheapest nor the most differentiated. Customers generally see you as a safe choice.',
    founderNote:
      'Your biggest challenge is figuring out whether customers value your differentiation enough to support a premium.',
    vc: 280, fc: 30000, rightPrice: 950, startCustomers: 110, churn: 0.03,
    position: { x: -0.28, y: 0.02 },
    evePlus: { label: 'Operations automation', amount: 750 },
    eveMinus: { label: 'Generic workflows', amount: 130 },
    aiName: 'Pinnacle Ops', personality: 'stable-operator',
  },
  {
    letter: 'E',
    id: 'service-heavy',
    company: 'OrbitIQ',
    archetype: 'Service-Heavy Provider',
    segment: 'Enterprise, high-touch',
    product: 'AI platform with high-touch implementation and support',
    positionText:
      'Customers receive significant onboarding, implementation and support. You create strong value but have a relatively high cost to serve.',
    founderNote: 'You cannot afford to win customers at any price.',
    vc: 350, fc: 38000, rightPrice: 1050, startCustomers: 110, churn: 0.02,
    position: { x: -0.02, y: 0.48 },
    evePlus: { label: 'Hands-on implementation support', amount: 950 },
    eveMinus: { label: 'Slower self-serve', amount: 200 },
    aiName: 'Fortis Cloud', personality: 'margin-defender',
  },
  {
    letter: 'F',
    id: 'volume-player',
    company: 'ScaleAI Business',
    archetype: 'Volume Player',
    segment: 'SMB self-serve',
    product: 'Standardized AI operations platform',
    positionText:
      'Your product is highly standardized and easy to deploy. Customers are relatively price-sensitive. You have one of the lowest cost structures in the market.',
    founderNote: 'You can survive lower prices better than many competitors.',
    vc: 200, fc: 22000, rightPrice: 800, startCustomers: 125, churn: 0.05,
    position: { x: -0.62, y: -0.7 },
    evePlus: { label: 'Templates ready on day one', amount: 500 },
    eveMinus: { label: 'Limited customisation', amount: 100 },
    aiName: 'LeanGrid', personality: 'low-cost',
  },
  {
    letter: 'G',
    id: 'vertical-specialist',
    company: 'MedFlow AI',
    archetype: 'Vertical Specialist',
    segment: 'Healthcare vertical',
    product: 'AI workflow platform specialized for healthcare organizations',
    positionText:
      'Your product is highly specialized. Customers value your industry expertise and are less interested in generic alternatives.',
    founderNote: 'Your differentiation may allow you to charge more than generalist competitors.',
    vc: 330, fc: 32000, rightPrice: 1350, startCustomers: 80, churn: 0.015,
    position: { x: 1.0, y: -0.35 },
    evePlus: { label: 'Healthcare-specific compliance and workflows', amount: 1550 },
    eveMinus: { label: 'Narrower scope', amount: 180 },
    aiName: 'Mosaic Health', personality: 'adaptive',
  },
  {
    letter: 'H',
    id: 'midmarket-generalist',
    company: 'CoreOps',
    archetype: 'Mid-Market Generalist',
    segment: 'Mid-market',
    product: 'General AI automation platform',
    positionText:
      'You target a broad customer base. You have reasonable product-market fit but limited differentiation.',
    founderNote: 'You believe customers will compare you directly against several competitors.',
    vc: 290, fc: 28000, rightPrice: 900, startCustomers: 100, churn: 0.035,
    position: { x: -0.52, y: -0.08 },
    evePlus: { label: 'Broad mid-market coverage', amount: 650 },
    eveMinus: { label: 'Not best at any one job', amount: 140 },
    aiName: 'Helix Systems', personality: 'market-follower',
  },
  {
    letter: 'I',
    id: 'high-cost-innovator',
    company: 'Nova Intelligence',
    archetype: 'High-Cost Innovator',
    segment: 'Enterprise, advanced',
    product: 'Advanced AI decision platform',
    positionText:
      'Your technology is one of the most advanced products in the market. Customers who understand the product see substantial value. However, the product is expensive to operate.',
    founderNote: 'You need sufficient pricing power to support your cost structure.',
    vc: 450, fc: 40000, rightPrice: 1300, startCustomers: 95, churn: 0.02,
    position: { x: 0.3, y: 0.88 },
    evePlus: { label: 'Advanced decision models', amount: 1400 },
    eveMinus: { label: 'Steep learning curve', amount: 250 },
    aiName: 'Bastion Software', personality: 'retaliator',
  },
  {
    letter: 'J',
    id: 'early-stage',
    company: 'LaunchAI',
    archetype: 'Early-Stage Challenger',
    segment: 'SMB self-serve',
    product: 'New AI productivity platform',
    positionText:
      'You are new to the market. You have little brand awareness and want to build a customer base quickly. Your cost structure is relatively lean.',
    founderNote: 'You need customers, but you also need to build a sustainable business.',
    vc: 240, fc: 20000, rightPrice: 850, startCustomers: 75, churn: 0.045,
    position: { x: -0.3, y: -0.78 },
    evePlus: { label: 'Modern productivity features', amount: 620 },
    eveMinus: { label: 'Unproven brand', amount: 160 },
    aiName: 'Echo Automate', personality: 'growth-seeker',
  },
];

export const COMPANY_BY_LETTER = Object.fromEntries(COMPANIES.map((c) => [c.letter, c])) as Record<Letter, CompanyData>;
export const COMPANY_BY_ID = Object.fromEntries(COMPANIES.map((c) => [c.id, c])) as Record<string, CompanyData>;
