import type { CompanyProfile } from '../../../shared/types';

// The ten confidential dossiers handed to human participants.
// Economics are the calibrated inputs to the market model.
export const PROFILES: CompanyProfile[] = [
  {
    id: 'premium-specialist',
    dossier: 'A',
    archetype: 'Premium Specialist',
    company: 'Lumina AI',
    product: 'AI workflow platform for regulated businesses',
    customerValue: 1350,
    elasticity: 1.0,
    variableCost: 380,
    fixedCost: 35000,
    sensitivityLabel: 'Low',
    position:
      'Customers see Lumina as a premium solution with strong reliability and implementation support. Customers care about price, but switching away from Lumina carries a meaningful operational risk.',
    founderNote: 'You believe your product creates significantly more value than the average competitor.',
  },
  {
    id: 'efficient-challenger',
    dossier: 'B',
    archetype: 'Efficient Challenger',
    company: 'SwiftOps',
    product: 'AI automation platform for growing businesses',
    customerValue: 950,
    elasticity: 2.2,
    variableCost: 220,
    fixedCost: 25000,
    sensitivityLabel: 'High',
    position:
      'You entered the market later than established players. Your product is simpler, but your cost structure is efficient. You believe aggressive pricing can help you gain customers quickly.',
    founderNote: 'You are willing to trade some margin for growth.',
  },
  {
    id: 'enterprise-solution',
    dossier: 'C',
    archetype: 'Enterprise Solution',
    company: 'Atlas Enterprise AI',
    product: 'Enterprise AI operations platform',
    customerValue: 1400,
    elasticity: 0.9,
    variableCost: 420,
    fixedCost: 42000,
    sensitivityLabel: 'Low',
    position:
      'Your product is designed for larger organizations with complex requirements. Customers value reliability, integration and support. You have higher costs than most competitors.',
    founderNote: 'Winning the right customers matters more than being the cheapest provider.',
  },
  {
    id: 'balanced-saas',
    dossier: 'D',
    archetype: 'Balanced SaaS',
    company: 'NexaFlow',
    product: 'AI business operations platform',
    customerValue: 1100,
    elasticity: 1.5,
    variableCost: 280,
    fixedCost: 30000,
    sensitivityLabel: 'Medium',
    position:
      'You are a credible middle-market player. Your product is neither the cheapest nor the most differentiated. Customers generally see you as a safe choice.',
    founderNote:
      'Your biggest challenge is figuring out whether customers value your differentiation enough to support a premium.',
  },
  {
    id: 'service-heavy',
    dossier: 'E',
    archetype: 'Service-Heavy Provider',
    company: 'OrbitIQ',
    product: 'AI platform with high-touch implementation and support',
    customerValue: 1250,
    elasticity: 1.3,
    variableCost: 350,
    fixedCost: 38000,
    sensitivityLabel: 'Medium',
    position:
      'Customers receive significant onboarding, implementation and support. You create strong value but have a relatively high cost to serve.',
    founderNote: 'You cannot afford to win customers at any price.',
  },
  {
    id: 'volume-player',
    dossier: 'F',
    archetype: 'Volume Player',
    company: 'ScaleAI Business',
    product: 'Standardized AI operations platform',
    customerValue: 900,
    elasticity: 2.3,
    variableCost: 200,
    fixedCost: 22000,
    sensitivityLabel: 'Very high',
    position:
      'Your product is highly standardized and easy to deploy. Customers are relatively price-sensitive. You have one of the lowest cost structures in the market.',
    founderNote: 'You can survive lower prices better than many competitors.',
  },
  {
    id: 'vertical-specialist',
    dossier: 'G',
    archetype: 'Vertical Specialist',
    company: 'MedFlow AI',
    product: 'AI workflow platform specialized for healthcare organizations',
    customerValue: 1300,
    elasticity: 1.1,
    variableCost: 330,
    fixedCost: 32000,
    sensitivityLabel: 'Low',
    position:
      'Your product is highly specialized. Customers value your industry expertise and are less interested in generic alternatives.',
    founderNote: 'Your differentiation may allow you to charge more than generalist competitors.',
  },
  {
    id: 'mid-market-generalist',
    dossier: 'H',
    archetype: 'Mid-Market Generalist',
    company: 'CoreOps',
    product: 'General AI automation platform',
    customerValue: 1050,
    elasticity: 1.7,
    variableCost: 290,
    fixedCost: 28000,
    sensitivityLabel: 'Medium-high',
    position:
      'You target a broad customer base. You have reasonable product-market fit but limited differentiation.',
    founderNote: 'You believe customers will compare you directly against several competitors.',
  },
  {
    id: 'high-cost-innovator',
    dossier: 'I',
    archetype: 'High-Cost Innovator',
    company: 'Nova Intelligence',
    product: 'Advanced AI decision platform',
    customerValue: 1450,
    elasticity: 1.0,
    variableCost: 450,
    fixedCost: 40000,
    sensitivityLabel: 'Low',
    position:
      'Your technology is one of the most advanced products in the market. Customers who understand the product see substantial value. However, the product is expensive to operate.',
    founderNote: 'You need sufficient pricing power to support your cost structure.',
  },
  {
    id: 'early-stage-challenger',
    dossier: 'J',
    archetype: 'Early-Stage Challenger',
    company: 'LaunchAI',
    product: 'New AI productivity platform',
    customerValue: 1000,
    elasticity: 2.0,
    variableCost: 240,
    fixedCost: 20000,
    sensitivityLabel: 'High',
    position:
      'You are new to the market. You have little brand awareness and want to build a customer base quickly. Your cost structure is relatively lean.',
    founderNote: 'You need customers, but you also need to build a sustainable business.',
  },
];

export const PROFILE_BY_ID: Record<string, CompanyProfile> = Object.fromEntries(
  PROFILES.map((p) => [p.id, p]),
);

const CODENAME_WORDS = [
  'Falcon', 'Onyx', 'Cobalt', 'Saffron', 'Harbor', 'Mirage', 'Cedar', 'Dune', 'Atlas', 'Ember',
  'Pearl', 'Oryx', 'Zenith', 'Lantern', 'Quartz', 'Monsoon', 'Sable', 'Vector', 'Obsidian', 'Meridian',
  'Granite', 'Sirocco', 'Nimbus', 'Indigo', 'Corsair',
];

export function codenameFor(index: number, rand: () => number): string {
  const word = CODENAME_WORDS[Math.floor(rand() * CODENAME_WORDS.length)];
  return `${word}-${String(index + 1).padStart(2, '0')}`;
}
