import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { main, needsBuild, parseOfficeArgs } from '../scripts/office.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'projects');
/** @type {string[]} */
const tmpDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ctk-office-'));
  tmpDirs.push(d);
  return d;
}
function busyCopy() {
  const d = path.join(tmp(), 'busy');
  fs.cpSync(path.join(FIXTURES, 'busy'), d, { recursive: true });
  return d;
}
function distWithIndex() {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'index.html'), '<!doctype html><title>office</title>');
  return d;
}
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}
function sink() {
  const lines = [];
  return { lines, write: (s) => lines.push(s), text: () => lines.join('') };
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('parseOfficeArgs', () => {
  it('requires --project', () => {
    expect(parseOfficeArgs([], { cwd: '/x' })).toEqual({ error: 'Use --project <path to a project with a .team folder>' });
  });

  it('rejects a project without a .team folder', () => {
    const r = parseOfficeArgs(['--project', tmp()], { cwd: '/x' });
    expect(r.error).toMatch(/\.team/);
  });

  it('parses --port and defaults to 4317', () => {
    const project = busyCopy();
    expect(parseOfficeArgs(['--project', project, '--port', '5000'], { cwd: '/x' })).toEqual({ project, port: 5000 });
    expect(parseOfficeArgs(['--project', project], { cwd: '/x' })).toEqual({ project, port: 4317 });
  });

  it('resolves --project relative to cwd', () => {
    const project = busyCopy();
    const r = parseOfficeArgs(['--project', 'busy'], { cwd: path.dirname(project) });
    expect(r.project).toBe(project);
  });

  it.each(['0', '65536', 'abc', '80.5', '-1', ''])('rejects invalid port %j', (port) => {
    const r = parseOfficeArgs(['--project', busyCopy(), '--port', port], { cwd: '/x' });
    expect(r.error).toMatch(/--port/);
  });
});

/** A fake kit folder with dashboard sources, all dated `at` (seconds). */
function fakeKit(at) {
  const kit = tmp();
  const files = ['dashboard/index.html', 'dashboard/vite.config.ts', 'dashboard/src/App.tsx', 'dashboard/src/components/Room.tsx'];
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(kit, f)), { recursive: true });
    fs.writeFileSync(path.join(kit, f), 'x');
    fs.utimesSync(path.join(kit, f), at, at);
  }
  return kit;
}
function distAt(at) {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'index.html'), 'built');
  fs.utimesSync(path.join(d, 'index.html'), at, at);
  return d;
}

describe('needsBuild', () => {
  const T = 1_700_000_000;
  it('is true when dist/index.html is missing', () => {
    expect(needsBuild(path.join(tmp(), 'dist'), fakeKit(T))).toBe(true);
  });
  it('is false when the build is newer than every source', () => {
    expect(needsBuild(distAt(T + 10), fakeKit(T))).toBe(false);
  });
  it.each(['dashboard/src/components/Room.tsx', 'dashboard/src/App.tsx', 'dashboard/index.html', 'dashboard/vite.config.ts'])('is true when %s is newer than the build', (f) => {
    const kit = fakeKit(T);
    fs.utimesSync(path.join(kit, f), T + 20, T + 20);
    expect(needsBuild(distAt(T + 10), kit)).toBe(true);
  });
  it('ignores missing source files', () => {
    expect(needsBuild(distAt(T + 10), tmp())).toBe(false);
  });
});

describe('main', () => {
  it('rebuilds when a dashboard source is newer than the build', async () => {
    const T = 1_700_000_000;
    const kitDir = fakeKit(T + 20);
    const distDir = distAt(T);
    const out = sink();
    const build = vi.fn(async () => { fs.utimesSync(path.join(distDir, 'index.html'), T + 30, T + 30); });
    const code = await main(['--project', busyCopy(), '--port', String(await freePort())], {
      cwd: '/x', stdout: out.write, stderr: () => {}, open: () => {}, build, distDir, kitDir,
      onReady: ({ server }) => { server.closeAllConnections(); server.close(); },
    });
    expect(code).toBe(0);
    expect(build).toHaveBeenCalledTimes(1);
    expect(out.text()).toMatch(/Building the office/);
  });

  it('builds only when dist is missing, serves /api/team, prints the URL and opens it', async () => {
    const project = busyCopy();
    const port = await freePort();
    const out = sink();
    const err = sink();
    const open = vi.fn();
    const build = vi.fn();
    let status;
    const code = await main(['--project', project, '--port', String(port)], {
      cwd: '/x', stdout: out.write, stderr: err.write, open, build, distDir: distWithIndex(), kitDir: fakeKit(1_700_000_000),
      onReady: async ({ server, url }) => {
        status = (await fetch(`${url}/api/team`)).status;
        server.closeAllConnections();
        server.close();
      },
    });
    expect(code).toBe(0);
    expect(status).toBe(200);
    expect(build).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(`http://127.0.0.1:${port}`);
    expect(out.text()).toContain(`Office is open at http://127.0.0.1:${port}`);
  });

  it('runs the build when dist/index.html is missing', async () => {
    const project = busyCopy();
    const distDir = path.join(tmp(), 'dist');
    const build = vi.fn(async () => {
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'index.html'), 'x');
    });
    await main(['--project', project, '--port', String(await freePort())], {
      cwd: '/x', stdout: () => {}, stderr: () => {}, open: () => {}, build, distDir,
      onReady: ({ server }) => { server.closeAllConnections(); server.close(); },
    });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('stops with exit 1 when the build fails', async () => {
    const err = sink();
    const code = await main(['--project', busyCopy()], {
      cwd: '/x', stdout: () => {}, stderr: err.write, open: () => {},
      build: async () => { throw new Error('boom'); }, distDir: path.join(tmp(), 'nope'),
    });
    expect(code).toBe(1);
    expect(err.text()).toMatch(/build/i);
  });

  it('prints a usage error and exits 1', async () => {
    const err = sink();
    const code = await main([], { cwd: '/x', stdout: () => {}, stderr: err.write, open: () => {}, build: () => {} });
    expect(code).toBe(1);
    expect(err.text()).toContain('Use --project');
  });

  it('exits 1 with a --port hint when the port is taken', async () => {
    const blocker = net.createServer();
    await new Promise((r) => blocker.listen(0, '127.0.0.1', r));
    const port = blocker.address().port;
    const err = sink();
    const open = vi.fn();
    try {
      const code = await main(['--project', busyCopy(), '--port', String(port)], {
        cwd: '/x', stdout: () => {}, stderr: err.write, open, build: () => {}, distDir: distWithIndex(),
      });
      expect(code).toBe(1);
      expect(err.text()).toContain('--port');
      expect(err.text().trim().split('\n')).toHaveLength(1);
      expect(open).not.toHaveBeenCalled();
    } finally {
      await new Promise((r) => blocker.close(r));
    }
  });
});
