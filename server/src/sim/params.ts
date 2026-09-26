// ============================================================================
//  SIMULATION PARAMETERS: the one file to edit to recalibrate the game.
// ============================================================================
//  Company economics (humans) live in ./profiles.ts, AI competitors in ./ai.ts.
//  Everything that shapes the market itself lives here.

/** Reference price every company starts from (QAR / month). */
export const REFERENCE_PRICE = 1000;

/** Minimum number of competitors in the market. AI fills the gap. */
export const MIN_COMPETITORS = 10;

/** Maximum number of human participants. */
export const MAX_HUMANS = 50;

/** Base customers per competitor: base_market_demand = this × total competitors. */
export const BASE_DEMAND_PER_COMPETITOR = 100;

/**
 * Global demand effect:
 *   factor = clamp(1 + SENSITIVITY × (REF − avg) / REF, MIN, MAX)
 * Lower market prices modestly grow the market; higher prices shrink it.
 */
export const GLOBAL_DEMAND_SENSITIVITY = 0.25;
export const GLOBAL_DEMAND_MIN = 0.85;
export const GLOBAL_DEMAND_MAX = 1.1;

/** Default decision for anyone who does not submit in time. */
export const DEFAULT_PRICE = 1000;

/** Round timers (seconds). The host can change them live. */
export const ROUND1_SECONDS = 120;
export const ROUND2_SECONDS = 180;

/** Counterfactual scenarios shown on the host debrief. */
export const COUNTERFACTUALS: { key: string; label: string; price: number }[] = [
  { key: 'hold', label: 'Everyone holds at QAR 1,000', price: 1000 },
  { key: 'cut', label: 'Everyone cuts to QAR 900', price: 900 },
  { key: 'raise', label: 'Everyone raises to QAR 1,100', price: 1100 },
];
