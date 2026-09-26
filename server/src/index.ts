import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { Game } from './game';
import { JsonStore } from './store';

// dist/server.js in production, server/src/index.ts in development
const here = path.dirname(fileURLToPath(import.meta.url));
const root = fs.existsSync(path.join(here, '..', 'package.json')) ? path.join(here, '..') : path.join(here, '..', '..');

// In development (`npm run dev`) the API always runs on SERVER_PORT/3001 behind Vite's proxy,
// because tooling often sets PORT for the Vite dev server itself.
const DEV = process.argv.includes('--dev');
const PORT = Number(DEV ? process.env.SERVER_PORT : process.env.PORT) || 3001;
const HOST_KEY = process.env.HOST_KEY || 'warroom';
const DATA_FILE = process.env.DATA_FILE || path.join(root, 'data', 'session.json');

if (!process.env.HOST_KEY) {
  console.warn('[war-room] HOST_KEY not set. Using the default "warroom". Set HOST_KEY before going live.');
}

const game = new Game({ store: new JsonStore(DATA_FILE) });
const { http } = createApp({ game, hostKey: HOST_KEY, staticDir: path.join(root, 'dist', 'client') });

http.listen(PORT, () => {
  console.log(`[war-room] listening on http://localhost:${PORT}`);
  console.log(`[war-room] session code ${game.state.code} · phase ${game.state.phase} · data ${DATA_FILE}`);
});
