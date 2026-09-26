import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ack, HostView, PlayerView } from '../shared/types';
import { createApp, type App } from '../server/src/app';
import { Game } from '../server/src/game';

const KEY = 'test-key';
let app: App;
let game: Game;
let url: string;
const sockets: Socket[] = [];

function client(): Promise<Socket> {
  const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  return new Promise((res) => s.on('connect', () => res(s)));
}

function call<T>(s: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((res) => s.emit(event, payload, res));
}

beforeEach(async () => {
  game = new Game({ seed: 'socket' });
  app = createApp({ game, hostKey: KEY, tickMs: 20 });
  await new Promise<void>((r) => app.http.listen(0, r));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close());
  await app.stop();
});

describe('socket protocol', () => {
  it('join → reconnect with token restores the same player without duplicating', async () => {
    const a = await client();
    const joined = await call<{ token: string; view: PlayerView }>(a, 'player:join', { name: 'Amira', code: game.state.code });
    expect(joined.ok).toBe(true);
    const { token, view } = joined.data!;
    a.close();

    const b = await client();
    const resumed = await call<{ view: PlayerView }>(b, 'player:resume', { token });
    expect(resumed.ok).toBe(true);
    expect(resumed.data!.view.me.id).toBe(view.me.id);
    expect(resumed.data!.view.me.profile.id).toBe(view.me.profile.id);
    expect(game.state.players.length).toBe(1);
  });

  it('unknown tokens are rejected so the client can show the join screen', async () => {
    const a = await client();
    const r = await call(a, 'player:resume', { token: 'nope' });
    expect(r).toEqual({ ok: false, error: 'unknown' });
  });

  it('host auth is required for host actions', async () => {
    const a = await client();
    expect((await call(a, 'host:auth', { key: 'wrong' })).ok).toBe(false);
    expect((await call(a, 'host:action', { action: { type: 'reset' } })).ok).toBe(false);
    const ok = await call<HostView>(a, 'host:auth', { key: KEY });
    expect(ok.ok).toBe(true);
    expect(ok.data!.session.code).toBe(game.state.code);
  });

  it('simultaneous submissions from many players all land, and results are pushed', async () => {
    const host = await client();
    await call(host, 'host:auth', { key: KEY });
    const players = await Promise.all(Array.from({ length: 15 }, () => client()));
    const tokens = await Promise.all(
      players.map(async (s, i) => (await call<{ token: string }>(s, 'player:join', { name: `P${i}`, code: game.state.code })).data!.token),
    );
    const results = players.map(
      (s) => new Promise<PlayerView>((res) => s.on('player:state', (v: PlayerView) => v.me.results[1] && res(v))),
    );
    await call(host, 'host:action', { action: { type: 'startRound', round: 1 } });
    const acks = await Promise.all(players.map((s, i) => call(s, 'player:submit', { token: tokens[i], price: [800, 900, 1000, 1100, 1200][i % 5] })));
    expect(acks.every((a) => a.ok)).toBe(true);
    const views = await Promise.all(results);
    expect(views.every((v) => v.me.results[1]!.revenue > 0)).toBe(true);
    expect(game.state.rounds['1']!.results.filter((r) => r.kind === 'human' && !r.defaulted).length).toBe(15);
  });

  it('CSV export requires the host key', async () => {
    const denied = await fetch(`${url}/api/export/players.csv`);
    expect(denied.status).toBe(403);
    const ok = await fetch(`${url}/api/export/players.csv?key=${KEY}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('player_id');
  });

  it('a reset tells connected players their session is gone', async () => {
    const host = await client();
    await call(host, 'host:auth', { key: KEY });
    const p = await client();
    await call(p, 'player:join', { name: 'Q', code: game.state.code });
    const gone = new Promise<boolean>((res) => p.on('player:gone', () => res(true)));
    await call(host, 'host:action', { action: { type: 'reset' } });
    expect(await gone).toBe(true);
  });
});
