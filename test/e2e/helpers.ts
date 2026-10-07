import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createOfficeServer } from '../../dashboard/server.mjs';
import { fixtureClock } from '../fixtures/projects/fixture-clock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
export const DIST_DIR = path.join(repoRoot, 'dashboard', 'dist');

export type Office = { url: string; projectDir: string; close: () => Promise<void> };

/**
 * Serve the built office against a temp copy of a fixture project, on fixture time.
 * @param fixture one of test/fixtures/projects (busy, empty, bad-team)
 */
export async function startOffice(fixture: string): Promise<Office> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office e2e '));
  const projectDir = path.join(tmp, fixture);
  fs.cpSync(path.join(repoRoot, 'test', 'fixtures', 'projects', fixture), projectDir, { recursive: true });
  const server = createOfficeServer({ projectDir, distDir: DIST_DIR, now: fixtureClock() });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    projectDir,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        resolve();
      });
    }),
  };
}
