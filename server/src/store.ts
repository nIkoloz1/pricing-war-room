import fs from 'node:fs';
import path from 'node:path';
import type { SessionState, Store } from './game';

/** Persists the whole session to one JSON file, atomically (write temp, then rename). */
export class JsonStore implements Store {
  constructor(private file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  load(): SessionState | null {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const data = JSON.parse(raw) as SessionState;
      return data?.version === 1 ? data : null;
    } catch {
      return null;
    }
  }

  save(state: SessionState): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
    fs.renameSync(tmp, this.file);
  }
}
