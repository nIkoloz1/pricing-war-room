import express from 'express';
import fs from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import type { Ack, HostAction } from '../../shared/types';
import { Game, GameError } from './game';

export interface AppOptions {
  game: Game;
  hostKey: string;
  staticDir?: string;
  tickMs?: number;
}

export interface App {
  http: HttpServer;
  io: Server;
  stop(): Promise<void>;
}

/** Wires the Game to HTTP + Socket.IO. */
export function createApp({ game, hostKey, staticDir, tickMs = 250 }: AppOptions): App {
  const app = express();
  const http = createServer(app);
  const io = new Server(http, {
    cors: { origin: true },
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  const isHost = (key: unknown) => typeof key === 'string' && key.length > 0 && key === hostKey;

  // ---- HTTP -----------------------------------------------------------------
  app.get('/api/health', (_req, res) => res.json({ ok: true, phase: game.state.phase }));

  const csv = (name: string, body: () => string) => (req: express.Request, res: express.Response) => {
    if (!isHost(req.query.key)) return res.status(403).send('Forbidden');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${game.state.code}.csv"`);
    res.send(body());
  };
  app.get('/api/export/players.csv', csv('pricing-war-room-players', () => game.playersCsv()));
  app.get('/api/export/market.csv', csv('pricing-war-room-market', () => game.marketCsv()));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // ---- Sockets --------------------------------------------------------------
  // socket.id -> player id, so we know who is online and where to send views
  const playerSockets = new Map<string, string>();

  const refreshConnected = () => {
    game.connected = new Set(playerSockets.values());
  };

  const sendPlayer = (socket: Socket) => {
    const pid = playerSockets.get(socket.id);
    if (!pid) return;
    const p = game.state.players.find((x) => x.id === pid);
    if (!p) {
      // Session was reset or player removed.
      playerSockets.delete(socket.id);
      socket.emit('player:gone');
      return;
    }
    socket.emit('player:state', game.playerView(p));
  };

  const broadcast = () => {
    refreshConnected();
    for (const [sid] of playerSockets) {
      const s = io.sockets.sockets.get(sid);
      if (s) sendPlayer(s);
    }
    io.to('host').emit('host:state', game.hostView());
  };
  game.onChange(broadcast);

  const reply = <T>(ack: unknown, body: Ack<T>) => {
    if (typeof ack === 'function') ack(body);
  };
  const fail = (ack: unknown, e: unknown) => {
    const msg = e instanceof GameError ? e.message : 'Something went wrong.';
    if (!(e instanceof GameError)) console.error(e);
    reply(ack, { ok: false, error: msg });
  };

  io.on('connection', (socket) => {
    socket.on('session:info', (_: unknown, ack: unknown) => {
      reply(ack, {
        ok: true,
        data: { code: game.state.code, phase: game.state.phase, registrationOpen: game.state.registrationOpen },
      });
    });

    socket.on('player:join', (payload: { name?: string; code?: string }, ack: unknown) => {
      try {
        const p = game.join(payload?.name, payload?.code);
        playerSockets.set(socket.id, p.id);
        refreshConnected();
        reply(ack, { ok: true, data: { token: p.token, view: game.playerView(p) } });
        io.to('host').emit('host:state', game.hostView());
      } catch (e) {
        fail(ack, e);
      }
    });

    socket.on('player:resume', (payload: { token?: string }, ack: unknown) => {
      const p = game.playerByToken(payload?.token);
      if (!p) return reply(ack, { ok: false, error: 'unknown' });
      playerSockets.set(socket.id, p.id);
      refreshConnected();
      reply(ack, { ok: true, data: { view: game.playerView(p) } });
      io.to('host').emit('host:state', game.hostView());
    });

    socket.on('player:submit', (payload: { token?: string; price?: number }, ack: unknown) => {
      try {
        const r = game.submit(payload?.token, payload?.price);
        const p = game.playerByToken(payload?.token)!;
        reply(ack, { ok: true, data: { ...r, view: game.playerView(p) } });
      } catch (e) {
        fail(ack, e);
      }
    });

    socket.on('host:auth', (payload: { key?: string }, ack: unknown) => {
      if (!isHost(payload?.key)) return reply(ack, { ok: false, error: 'Invalid host key.' });
      socket.join('host');
      socket.data.host = true;
      reply(ack, { ok: true, data: game.hostView() });
    });

    socket.on('host:action', (payload: { key?: string; action?: HostAction }, ack: unknown) => {
      if (!socket.data.host && !isHost(payload?.key)) return reply(ack, { ok: false, error: 'Not authorised.' });
      try {
        if (!payload?.action) throw new GameError('Missing action.');
        game.hostAction(payload.action);
        reply(ack, { ok: true });
      } catch (e) {
        fail(ack, e);
      }
    });

    socket.on('disconnect', () => {
      if (playerSockets.delete(socket.id)) {
        refreshConnected();
        io.to('host').emit('host:state', game.hostView());
      }
    });
  });

  const timer = setInterval(() => {
    try {
      game.tick();
    } catch (e) {
      console.error('tick failed', e);
    }
  }, tickMs);

  return {
    http,
    io,
    stop: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        io.close(() => resolve());
      }),
  };
}
