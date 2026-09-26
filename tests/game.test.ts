import { describe, expect, it } from 'vitest';
import { PRICE_OPTIONS, type Price } from '../shared/types';
import { Game, GameError, type SessionState, type Store } from '../server/src/game';

class MemoryStore implements Store {
  data: string | null = null;
  saves = 0;
  load() {
    return this.data ? (JSON.parse(this.data) as SessionState) : null;
  }
  save(s: SessionState) {
    this.data = JSON.stringify(s);
    this.saves++;
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

const pick = (i: number): Price => PRICE_OPTIONS[i % PRICE_OPTIONS.length];

function playRound(game: Game, round: 1 | 2, tokens: string[]) {
  game.hostAction({ type: 'startRound', round });
  tokens.forEach((t, i) => game.submit(t, pick(i + round)));
}

describe.each([1, 2, 5, 10, 20, 50])('%i human(s)', (n) => {
  it('fills with AI to at least 10 competitors and resolves both rounds', () => {
    const { game, players } = setup(n);
    const tokens = players.map((p) => p.token);
    playRound(game, 1, tokens);
    const r1 = game.state.rounds['1']!;
    expect(r1.totalCompetitors).toBe(Math.max(n, 10));
    expect(game.state.ai.length).toBe(Math.max(0, 10 - n));
    expect(r1.baseDemand).toBe(100 * Math.max(n, 10));
    expect(game.state.phase).toBe('r1_results');

    // Every human sees the three core numbers after Round 1.
    for (const p of players) {
      const v = game.playerView(p);
      const res = v.me.results[1]!;
      expect(res.marketShare).toBeGreaterThan(0);
      expect(res.revenue).toBe(res.units * res.price);
      expect(res.profit).toBe(res.revenue - res.variableCostTotal - res.fixedCost);
      expect(v.market[1]).toBeDefined();
    }

    game.hostAction({ type: 'startWorkshop' });
    playRound(game, 2, tokens);
    expect(game.state.phase).toBe('r2_results');
    const r2 = game.state.rounds['2']!;
    expect(r2.totalCompetitors).toBe(Math.max(n, 10));
    // Same company across rounds.
    for (const p of players) {
      const v = game.playerView(p);
      expect(v.me.profile.id).toBe(p.profileId);
      expect(v.me.results[1]).toBeDefined();
      expect(v.me.results[2]).toBeDefined();
    }
    // Shares sum to 1 across humans + AI.
    expect(r2.results.reduce((a, r) => a + r.marketShare, 0)).toBeCloseTo(1, 9);
    game.hostAction({ type: 'showDebrief' });
    const d = game.hostView().debrief!;
    expect(d.counterfactuals.map((c) => c.key)).toEqual(['actual1', 'actual2', 'hold', 'cut', 'raise']);
    expect(d.learning.humans).toBe(n);
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

  it('assigns every dossier once per block of ten', () => {
    const { players } = setup(20);
    expect(new Set(players.slice(0, 10).map((p) => p.profileId)).size).toBe(10);
    expect(new Set(players.slice(10, 20).map((p) => p.profileId)).size).toBe(10);
  });

  it('ignores duplicate submissions (first decision stands)', () => {
    const { game, players } = setup(3);
    game.hostAction({ type: 'startRound', round: 1 });
    expect(game.submit(players[0].token, 800)).toEqual({ price: 800, duplicate: false });
    expect(game.submit(players[0].token, 1200)).toEqual({ price: 800, duplicate: true });
    expect(game.state.decisions['1'][players[0].id]).toBe(800);
  });

  it('rejects invalid prices and submissions outside a round', () => {
    const { game, players } = setup(2);
    expect(() => game.submit(players[0].token, 1000)).toThrow(/not open/);
    game.hostAction({ type: 'startRound', round: 1 });
    expect(() => game.submit(players[0].token, 950)).toThrow(/Invalid/);
    expect(() => game.submit('bogus', 1000)).toThrow(/Unknown/);
  });

  it('timer expiry resolves with QAR 1000 for missing decisions', () => {
    const { game, clock, players } = setup(3);
    game.hostAction({ type: 'startRound', round: 1 });
    game.submit(players[0].token, 900);
    clock.advance(119_000);
    game.tick();
    expect(game.state.phase).toBe('r1_decision');
    clock.advance(2_000);
    game.tick();
    expect(game.state.phase).toBe('r1_results');
    const r = game.state.rounds['1']!;
    const missing = r.results.find((x) => x.id === players[1].id)!;
    expect(missing.price).toBe(1000);
    expect(missing.defaulted).toBe(true);
    expect(r.results.find((x) => x.id === players[0].id)!.defaulted).toBe(false);
  });

  it('pause freezes the clock; resume continues it', () => {
    const { game, clock } = setup(2);
    game.hostAction({ type: 'startRound', round: 1 });
    clock.advance(30_000);
    game.hostAction({ type: 'pause' });
    clock.advance(500_000);
    game.tick();
    expect(game.state.phase).toBe('r1_decision');
    expect(game.state.timer!.remainingMs).toBe(90_000);
    game.hostAction({ type: 'resume' });
    clock.advance(89_000);
    game.tick();
    expect(game.state.phase).toBe('r1_decision');
    clock.advance(2_000);
    game.tick();
    expect(game.state.phase).toBe('r1_results');
  });

  it('Round 2 timer defaults to 180 seconds', () => {
    const { game, players } = setup(1);
    playRound(game, 1, [players[0].token]);
    game.hostAction({ type: 'startWorkshop' });
    game.hostAction({ type: 'startRound', round: 2 });
    expect(game.state.timer!.durationMs).toBe(180_000);
  });

  it('results stay hidden until revealed when auto-reveal is off', () => {
    const { game, players } = setup(2);
    game.hostAction({ type: 'setAutoReveal', value: false });
    playRound(game, 1, players.map((p) => p.token));
    expect(game.state.phase).toBe('r1_clearing');
    expect(game.playerView(players[0]).me.results[1]).toBeUndefined();
    game.hostAction({ type: 'reveal' });
    expect(game.playerView(players[0]).me.results[1]).toBeDefined();
  });

  it('players never receive other companies\' economics', () => {
    const { game, players } = setup(4);
    playRound(game, 1, players.map((p) => p.token));
    const json = JSON.stringify(game.playerView(players[0]));
    for (const p of players.slice(1)) expect(json).not.toContain(p.id);
    expect(json).not.toContain('AI01');
  });

  it('persists and restores Round 1 and Round 2 from the store', () => {
    const { game, store, players, clock } = setup(3);
    playRound(game, 1, players.map((p) => p.token));
    const r1 = JSON.stringify(game.state.rounds['1']);
    const reloaded = new Game({ now: clock.now, store });
    expect(JSON.stringify(reloaded.state.rounds['1'])).toBe(r1);
    reloaded.hostAction({ type: 'startWorkshop' });
    playRound(reloaded, 2, players.map((p) => p.token));
    const again = new Game({ now: clock.now, store });
    expect(again.state.phase).toBe('r2_results');
    expect(again.playerByToken(players[0].token)!.profileId).toBe(players[0].profileId);
    expect(again.playerView(again.playerByToken(players[2].token)!).me.results[2]).toBeDefined();
  });

  it('AI competitors react between rounds and are reproducible from the seed', () => {
    const run = (seed: string) => {
      const { game, players } = setup(1, seed);
      playRound(game, 1, [players[0].token]);
      game.hostAction({ type: 'startWorkshop' });
      playRound(game, 2, [players[0].token]);
      return [game.state.aiDecisions['1'], game.state.aiDecisions['2']];
    };
    expect(run('abc')).toEqual(run('abc'));
    // Across seeds, at least some AI change price between rounds.
    const changed = ['s1', 's2', 's3', 's4'].some((s) => {
      const [a, b] = run(s);
      return Object.keys(a).some((k) => a[k] !== b[k]);
    });
    expect(changed).toBe(true);
  });

  it('counterfactuals: everyone cutting earns less total profit than everyone holding', () => {
    const { game, players } = setup(12);
    playRound(game, 1, players.map((p) => p.token));
    const cf = game.debrief().counterfactuals;
    const get = (k: string) => cf.find((c) => c.key === k)!;
    expect(get('cut').totalProfit).toBeLessThan(get('hold').totalProfit);
    expect(get('raise').totalProfit).toBeGreaterThan(get('hold').totalProfit);
    expect(get('hold').totalDemand).toBe(1200);
  });

  it('demo mode: simulated participants submit on their own', () => {
    const { game, clock } = setup(0);
    game.hostAction({ type: 'loadDemo', count: 20 });
    expect(game.state.players.length).toBe(20);
    game.hostAction({ type: 'startRound', round: 1 });
    for (let i = 0; i < 60 && game.state.phase === 'r1_decision'; i++) {
      clock.advance(1000);
      game.tick();
    }
    expect(game.state.phase).toBe('r1_results');
    expect(game.state.rounds['1']!.results.every((r) => !r.defaulted)).toBe(true);
    game.hostAction({ type: 'startWorkshop' });
    game.hostAction({ type: 'startRound', round: 2 });
    for (let i = 0; i < 80 && game.state.phase === 'r2_decision'; i++) {
      clock.advance(1000);
      game.tick();
    }
    expect(game.state.phase).toBe('r2_results');
  });

  it('CSV export has one row per human with all required columns', () => {
    const { game, players } = setup(4);
    playRound(game, 1, players.map((p) => p.token));
    game.hostAction({ type: 'startWorkshop' });
    playRound(game, 2, players.map((p) => p.token));
    const lines = game.playersCsv().trim().split('\n');
    expect(lines.length).toBe(5);
    for (const col of [
      'player_id', 'codename', 'company_archetype', 'customer_value', 'elasticity', 'variable_cost', 'fixed_cost',
      'round1_price', 'round1_market_share', 'round1_units', 'round1_revenue', 'round1_profit',
      'round2_price', 'round2_market_share', 'round2_units', 'round2_revenue', 'round2_profit',
      'price_change', 'market_share_change', 'revenue_change', 'profit_change',
    ]) expect(lines[0].split(',')).toContain(col);
    expect(game.marketCsv()).toContain('counterfactual');
  });

  it('reset creates a fresh session and invalidates old tokens', () => {
    const { game, players } = setup(3);
    const code = game.state.code;
    game.hostAction({ type: 'reset' });
    expect(game.state.players.length).toBe(0);
    expect(game.state.code).not.toBe(code);
    expect(game.playerByToken(players[0].token)).toBeUndefined();
  });
});
