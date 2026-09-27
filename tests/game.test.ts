import { describe, expect, it } from 'vitest';
import { PRICE_OPTIONS } from '../shared/types';
import { Game, GameError, type SessionState, type Store, type StoredPlayer } from '../server/src/game';
import { PROFILE_BY_ID } from '../server/src/sim/profiles';

class MemoryStore implements Store {
  data: string | null = null;
  load() {
    return this.data ? JSON.parse(this.data) : null;
  }
  save(s: SessionState) {
    this.data = JSON.stringify(s);
  }
}

function setup(humans: number, seed = 'test-seed') {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const store = new MemoryStore();
  const game = new Game({ now: clock.now, store, seed });
  const players = Array.from({ length: humans }, (_, i) => game.join(`Player ${i + 1}`, game.state.code));
  return { game, clock, store, players };
}

const pick = (i: number) => PRICE_OPTIONS[(i * 5) % PRICE_OPTIONS.length];
const letter = (p: StoredPlayer) => PROFILE_BY_ID[p.profileId].letter;

function playRound1(game: Game, players: StoredPlayer[]) {
  game.hostAction({ type: 'startRound', round: 1 });
  players.forEach((p, i) => game.submit(p.token, pick(i + 1)));
}

/** Round 2 requires the quiz answer first. */
function playRound2(game: Game, players: StoredPlayer[]) {
  game.hostAction({ type: 'startRound', round: 2 });
  players.forEach((p, i) => {
    const desk = game.playerView(p).desk!;
    game.guess(p.token, desk.options[0].id);
    game.submit(p.token, pick(i + 3));
  });
}

describe('parallel markets', () => {
  it('23 humans → 3 markets of 10, no archetype twice in a market', () => {
    const { game, players } = setup(23);
    playRound1(game, players);
    expect(game.state.marketCount).toBe(3);
    const r1 = game.state.rounds['1']!;
    expect(r1.markets).toHaveLength(3);
    for (const m of r1.markets) {
      expect(m.results).toHaveLength(10);
      expect(new Set(m.results.map((r) => r.letter)).size).toBe(10);
    }
    expect(r1.totalCompetitors).toBe(30);
    expect(game.state.ai).toHaveLength(7);
    for (const a of game.state.ai) expect(a.id).toMatch(/^M\d-AI-[A-J]$/);
  });

  it('4 humans → 1 market with 6 AI covering the missing archetypes', () => {
    const { game, players } = setup(4);
    playRound1(game, players);
    expect(game.state.marketCount).toBe(1);
    expect(game.state.ai).toHaveLength(6);
    const letters = new Set([...players.map(letter), ...game.state.ai.map((a) => a.letter)]);
    expect(letters.size).toBe(10);
  });

  it('removing a player during registration can never double an archetype in a market', () => {
    const { game, players } = setup(12);
    game.hostAction({ type: 'removePlayer', playerId: players[3].id });
    const rest = game.state.players;
    game.hostAction({ type: 'startRound', round: 1 });
    for (let m = 0; m < game.state.marketCount; m++) {
      const inM = rest.filter((p) => p.marketIndex === m).map(letter);
      expect(new Set(inM).size).toBe(inM.length);
    }
  });

  it.each([1, 2, 5, 10, 20, 50])('%i human(s): full lifecycle, every market clears to 10 companies', (n) => {
    const { game, players } = setup(n);
    playRound1(game, players);
    for (const p of players) {
      const r = game.playerView(p).me.results[1]!;
      expect(r.revenue).toBe(r.units * r.price);
      expect(r.profit).toBe(r.revenue - r.variableCostTotal - r.fixedCost);
      expect(r.shareChangePp).toBeCloseTo((r.share - r.startShare) * 100, 9);
      expect(r.competitors).toHaveLength(9);
      expect(r.dossierRightPrice).toBe(PROFILE_BY_ID[p.profileId].rightPrice);
    }
    game.hostAction({ type: 'startWorkshop' });
    playRound2(game, players);
    expect(game.state.phase).toBe('r2_results');
    game.hostAction({ type: 'showDebrief' });
    const d = game.hostView().debrief!;
    expect(d.counterfactuals.map((c) => c.key)).toEqual(['actual1', 'actual2', 'hold', 'right', 'smbcut']);
    expect(d.stats.humans).toBe(n);
    expect(d.leaderboard).toHaveLength(game.state.marketCount * 10);
  });
});

describe('Round 2 desk and quiz', () => {
  it('flows and the primary competitor are hidden before a guess and shown after', () => {
    const { game, players } = setup(3);
    playRound1(game, players);
    const p = players[0];
    let v = game.playerView(p);
    expect(v.me.results[1]!.flows).toBeUndefined();
    expect(v.me.results[1]!.primaryCompetitorId).toBeUndefined();
    expect(v.desk).toBeNull();

    game.hostAction({ type: 'startWorkshop' });
    game.hostAction({ type: 'startRound', round: 2 });
    v = game.playerView(p);
    expect(v.desk!.options).toHaveLength(4);
    expect(v.desk!.reveal).toBeNull();
    expect(v.me.results[1]!.flows).toBeUndefined();
    const json = JSON.stringify(v);
    expect(json).not.toContain('primaryCompetitorId');

    const truth = game.state.rounds['1']!.markets[p.marketIndex!].results.find((r) => r.id === p.id)!.primaryCompetitorId;
    expect(v.desk!.options.map((o) => o.id)).toContain(truth);

    game.guess(p.token, v.desk!.options[0].id);
    v = game.playerView(p);
    expect(v.desk!.reveal!.primaryId).toBe(truth);
    expect(v.desk!.reveal!.correct).toBe(v.desk!.options[0].id === truth);
    expect(v.me.results[1]!.flows).toHaveLength(9);
    expect(v.desk!.reveal!.table.rows.length).toBeGreaterThanOrEqual(3);
    // Other players still cannot see theirs.
    expect(game.playerView(players[1]).desk!.reveal).toBeNull();
  });

  it('a guess is allowed once, only in r2_decision, and the price grid needs it first', () => {
    const { game, players } = setup(2);
    playRound1(game, players);
    const p = players[0];
    expect(() => game.guess(p.token, 'x')).toThrow(/Round 2/);
    game.hostAction({ type: 'startWorkshop' });
    game.hostAction({ type: 'startRound', round: 2 });
    expect(() => game.submit(p.token, 1000)).toThrow(/question/);
    const opts = game.playerView(p).desk!.options;
    expect(() => game.guess(p.token, 'not-an-option')).toThrow(/listed/);
    game.guess(p.token, opts[1].id);
    expect(() => game.guess(p.token, opts[2].id)).toThrow(/already/);
    expect(game.state.guesses[p.id]).toBe(opts[1].id);
    game.submit(p.token, 1100);
    game.hostAction({ type: 'endRound' });
    expect(() => game.guess(players[1].token, opts[0].id)).toThrow(/Round 2/);
  });

  it('quiz options are the four most similar competitors (primary always included), in a stable seeded order', () => {
    const { game, players } = setup(25, 'quiz-seed');
    playRound1(game, players);
    game.hostAction({ type: 'startWorkshop' });
    game.hostAction({ type: 'startRound', round: 2 });
    for (const p of players) {
      const a = game.playerView(p).desk!.options.map((o) => o.id);
      expect(game.playerView(p).desk!.options.map((o) => o.id)).toEqual(a); // stable
      const board = game.playerView(p).me.results[1]!.competitors.map((c) => c.id); // sorted by similarity
      const truth = game.state.rounds['1']!.markets[p.marketIndex!].results.find((r) => r.id === p.id)!.primaryCompetitorId;
      expect(a).toContain(truth);
      const expected = board.slice(0, 4);
      if (!expected.includes(truth)) expected[3] = truth;
      expect([...a].sort()).toEqual([...expected].sort());
    }
  });
});

describe('rules', () => {
  it('rejects a wrong session code and joins after registration is locked', () => {
    const { game } = setup(1);
    expect(() => game.join('X', 'NOPE')).toThrow(GameError);
    game.hostAction({ type: 'lockRegistration' });
    expect(() => game.join('Late', game.state.code)).toThrow('Registration closed.');
  });

  it('caps humans at 50', () => {
    const { game } = setup(50);
    expect(() => game.join('51st', game.state.code)).toThrow(/full/);
  });

  it('deals every dossier once per block of ten', () => {
    const { players } = setup(20);
    expect(new Set(players.slice(0, 10).map((p) => p.profileId)).size).toBe(10);
    expect(new Set(players.slice(10, 20).map((p) => p.profileId)).size).toBe(10);
  });

  it('prices must be on the 16-step grid; duplicates keep the first decision', () => {
    const { game, players } = setup(3);
    game.hostAction({ type: 'startRound', round: 1 });
    expect(() => game.submit(players[0].token, 975)).toThrow(/Invalid/);
    expect(() => game.submit(players[0].token, 1500)).toThrow(/Invalid/);
    expect(game.submit(players[0].token, 750)).toEqual({ price: 750, duplicate: false });
    expect(game.submit(players[0].token, 1450)).toEqual({ price: 750, duplicate: true });
  });

  it('R1 non-submitters default to 1,000; R2 non-submitters default to their R1 price', () => {
    const { game, clock, players } = setup(3);
    game.hostAction({ type: 'startRound', round: 1 });
    game.submit(players[0].token, 1250);
    clock.advance(241_000);
    game.tick();
    expect(game.state.phase).toBe('r1_results');
    const r1 = game.state.rounds['1']!.markets[0].results;
    expect(r1.find((r) => r.id === players[1].id)!.price).toBe(1000);
    expect(r1.find((r) => r.id === players[1].id)!.defaulted).toBe(true);

    game.hostAction({ type: 'startWorkshop' });
    game.hostAction({ type: 'startRound', round: 2 });
    expect(game.state.timer!.durationMs).toBe(300_000);
    clock.advance(301_000);
    game.tick();
    const r2 = game.state.rounds['2']!.markets[0].results;
    expect(r2.find((r) => r.id === players[0].id)!.price).toBe(1250);
    expect(r2.find((r) => r.id === players[0].id)!.defaulted).toBe(true);
    expect(r2.find((r) => r.id === players[1].id)!.price).toBe(1000);
  });

  it('pause freezes the clock; resume continues it', () => {
    const { game, clock } = setup(2);
    game.hostAction({ type: 'startRound', round: 1 });
    clock.advance(30_000);
    game.hostAction({ type: 'pause' });
    clock.advance(500_000);
    game.tick();
    expect(game.state.phase).toBe('r1_decision');
    expect(game.state.timer!.remainingMs).toBe(210_000);
    game.hostAction({ type: 'resume' });
    clock.advance(209_000);
    game.tick();
    expect(game.state.phase).toBe('r1_decision');
    clock.advance(2_000);
    game.tick();
    expect(game.state.phase).toBe('r1_results');
  });

  it('results stay hidden until revealed when auto-reveal is off', () => {
    const { game, players } = setup(2);
    game.hostAction({ type: 'setAutoReveal', value: false });
    playRound1(game, players);
    expect(game.state.phase).toBe('r1_clearing');
    expect(game.playerView(players[0]).me.results[1]).toBeUndefined();
    game.hostAction({ type: 'reveal' });
    expect(game.playerView(players[0]).me.results[1]).toBeDefined();
  });

  it("players never receive other companies' economics or other markets", () => {
    const { game, players } = setup(13);
    playRound1(game, players);
    const p = players.find((x) => x.marketIndex === 0)!;
    const v = game.playerView(p);
    const json = JSON.stringify(v);
    for (const other of players.filter((x) => x.marketIndex === 1)) expect(json).not.toContain(other.id);
    expect(json).not.toMatch(/"vc":\d+.*"vc":\d+/s); // only their own profile carries costs
    for (const row of v.me.results[1]!.competitors) expect(Object.keys(row).sort()).toEqual(['company', 'id', 'letter', 'price', 'segment', 'similarity']);
  });

  it('persists and restores both rounds; a stored state from another version starts fresh', () => {
    const { game, store, players, clock } = setup(3);
    playRound1(game, players);
    const reloaded = new Game({ now: clock.now, store });
    expect(JSON.stringify(reloaded.state.rounds['1'])).toBe(JSON.stringify(game.state.rounds['1']));
    reloaded.hostAction({ type: 'startWorkshop' });
    playRound2(reloaded, players);
    const again = new Game({ now: clock.now, store });
    expect(again.state.phase).toBe('r2_results');
    expect(again.playerByToken(players[0].token)!.profileId).toBe(players[0].profileId);

    store.data = JSON.stringify({ ...JSON.parse(store.data!), version: 1 });
    const fresh = new Game({ now: clock.now, store });
    expect(fresh.state.version).toBe(2);
    expect(fresh.state.players).toHaveLength(0);
  });

  it('AI react between rounds and are reproducible from the seed', () => {
    const run = (seed: string) => {
      const { game, players } = setup(1, seed);
      playRound1(game, players);
      game.hostAction({ type: 'startWorkshop' });
      playRound2(game, players);
      return [game.state.aiDecisions['1'], game.state.aiDecisions['2']];
    };
    expect(run('abc')).toEqual(run('abc'));
    const [a, b] = run('s1');
    expect(Object.keys(a).some((k) => a[k] !== b[k])).toBe(true);
  });

  it('counterfactuals sum across markets', () => {
    const { game, players } = setup(12);
    playRound1(game, players);
    const cf = game.debrief().counterfactuals;
    const get = (k: string) => cf.find((c) => c.key === k)!;
    expect(get('hold').totalUnits).toBe(1065 * 2);
    expect(get('right').totalProfit).toBeGreaterThan(get('hold').totalProfit);
    expect(get('smbcut').totalProfit).toBeLessThan(get('right').totalProfit);
  });

  it('leaderboard and CSV carry the new columns', () => {
    const { game, players } = setup(4);
    playRound1(game, players);
    game.hostAction({ type: 'startWorkshop' });
    playRound2(game, players);
    const d = game.debrief();
    const row = d.leaderboard.find((r) => r.kind === 'human')!;
    expect(row).toMatchObject({ market: 0 });
    expect(row.r1SharePp).not.toBeNull();
    expect(row.r2SharePp).not.toBeNull();
    expect(typeof row.guessCorrect).toBe('boolean');
    expect(d.quadrantRound).toBe(2);
    expect(d.quadrant).toHaveLength(10);

    const lines = game.playersCsv().trim().split('\n');
    expect(lines).toHaveLength(5);
    const cols = lines[0].split(',');
    for (const col of [
      'player_id', 'codename', 'market', 'archetype_letter', 'company_archetype', 'right_price', 'max_wtp', 'start_customers', 'start_share',
      'round1_price', 'round1_market_share', 'round1_units', 'round1_revenue', 'round1_profit', 'round1_share_change_pp',
      'round1_best_price_given_competitors', 'round1_profit_captured', 'primary_competitor_r1', 'guess', 'guess_correct',
      'round2_price', 'round2_market_share', 'round2_units', 'round2_revenue', 'round2_profit', 'round2_share_change_pp',
      'round2_best_price_given_competitors', 'round2_profit_captured', 'r2_primary_competitor',
      'price_change', 'market_share_change', 'revenue_change', 'profit_change',
    ]) expect(cols).toContain(col);
    const market = game.marketCsv();
    expect(market).toContain('counterfactual');
    expect(market).toMatch(/^market,1,1,/m);
  });

  it('demo mode: 30 simulated participants run registration → debrief on their own', () => {
    const { game, clock } = setup(0);
    game.hostAction({ type: 'loadDemo', count: 30 });
    expect(game.state.players).toHaveLength(30);
    game.hostAction({ type: 'startRound', round: 1 });
    for (let i = 0; i < 300 && game.state.phase === 'r1_decision'; i++) {
      clock.advance(1000);
      game.tick();
    }
    expect(game.state.phase).toBe('r1_results');
    expect(game.state.marketCount).toBe(3);
    expect(game.state.rounds['1']!.markets.flatMap((m) => m.results).filter((r) => r.kind === 'human').every((r) => !r.defaulted)).toBe(true);
    game.hostAction({ type: 'startWorkshop' });
    game.hostAction({ type: 'startRound', round: 2 });
    for (let i = 0; i < 400 && game.state.phase === 'r2_decision'; i++) {
      clock.advance(1000);
      game.tick();
    }
    expect(game.state.phase).toBe('r2_results');
    expect(Object.keys(game.state.guesses)).toHaveLength(30);
    game.hostAction({ type: 'showDebrief' });
    const d = game.hostView().debrief!;
    expect(d.stats.guesses).toBe(30);
    expect(d.stats.pctGuessCorrect).not.toBeNull();
    for (const p of game.state.players) {
      const v = game.playerView(p);
      expect(v.me.results[2]!.flows).toHaveLength(9);
    }
  });

  it('reset creates a fresh session and invalidates old tokens', () => {
    const { game, players } = setup(3);
    const code = game.state.code;
    game.hostAction({ type: 'reset' });
    expect(game.state.players).toHaveLength(0);
    expect(game.state.code).not.toBe(code);
    expect(game.playerByToken(players[0].token)).toBeUndefined();
  });
});
