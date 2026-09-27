// ============================================================================
//  SIMULATION PARAMETERS: the one file to edit to recalibrate the game.
// ============================================================================
//  Company economics (both humans and AI fills) live in ./companies.ts.
//  AI and demo-bot behaviour lives in ./ai.ts. The engine is ./market.ts.

import { PRICE_OPTIONS } from '../../../shared/types';

/** Going market rate every company starts from (QAR / month). */
export const REFERENCE_PRICE = 1000;

/** Similarity s = exp(−KAPPA × distance between positions). Higher = similarity falls faster. */
export const KAPPA = 3.0;

/** Share of a company's price response that flows between similar rivals (0..1). */
export const LAMBDA = 0.6;

/** Companies per market: one of each archetype A..J. */
export const MARKET_SIZE = 10;

/** Maximum number of human participants. */
export const MAX_HUMANS = 50;

/** Price grid, shared with the client. */
export const PRICE_GRID = PRICE_OPTIONS;
export const MIN_PRICE = PRICE_GRID[0];
export const MAX_PRICE = PRICE_GRID[PRICE_GRID.length - 1];

/** Default decision in Round 1 for anyone who does not submit. Round 2 defaults to their Round 1 price. */
export const DEFAULT_PRICE_R1 = 1000;

/** Round timers (seconds). The host can change them live. */
export const ROUND1_SECONDS = 240;
export const ROUND2_SECONDS = 300;

/** Letters of the price-sensitive SMB cluster used in the debrief counterfactual. */
export const SMB_CLUSTER = ['B', 'F', 'J'] as const;
