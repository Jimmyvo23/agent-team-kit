import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { main, parseOfficeArgs } from '../scripts/office.mjs';

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

describe('main', () => {
  it('builds only when dist is missing, serves /api/team, prints the URL and opens it', async () => {
    const project = busyCopy();
    const port = await freePort();
    const out = sink();
    const err = sink();
    const open = vi.fn();
    const build = vi.fn();
    let status;
    const code = await main(['--project', project, '--port', String(port)], {
      cwd: '/x', stdout: out.write, stderr: err.write, open, build, distDir: distWithIndex(),
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
