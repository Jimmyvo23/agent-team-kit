import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createOfficeServer } from '../dashboard/server.mjs';
import { appendEvent } from '../lib/events.mjs';
import { FIXTURE_NOW } from './fixtures/projects/fixture-clock.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'projects');
const fixedNow = () => new Date(FIXTURE_NOW);

/** @type {string[]} */
const tmpDirs = [];
/** @type {import('node:http').Server[]} */
const servers = [];

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ctk-server-'));
  tmpDirs.push(d);
  return d;
}
function copyFixture(name) {
  const d = path.join(tmp(), name);
  fs.cpSync(path.join(FIXTURES, name), d, { recursive: true });
  return d;
}
async function start(opts) {
  const server = createOfficeServer({ now: fixedNow, ...opts });
  servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${server.address().port}`;
}
function distWith(files) {
  const d = tmp();
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, name)), { recursive: true });
    fs.writeFileSync(path.join(d, name), body);
  }
  return d;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => { s.close(r); s.closeAllConnections(); })));
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('GET /api/team', () => {
  it('serves the busy fixture state with no-store and writes agent-status.json', async () => {
    const projectDir = copyFixture('busy');
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist') });
    const res = await fetch(`${base}/api/team`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const state = await res.json();
    expect(state.agents).toHaveLength(6);
    const by = Object.fromEntries(state.agents.map((a) => [a.name, a]));
    expect(by.Planner.status).toBe('working');
    expect(by.Backend).toMatchObject({ status: 'working', currentTask: 'T-004', progress: 40, nextStep: 'Write the free-trial tests', stale: false });
    expect(by.Frontend).toMatchObject({ status: 'working', stale: true });
    expect(by.Tester.status).toBe('idle');
    expect(by.Reviewer).toMatchObject({ status: 'blocked', reason: 'Checks failing' });
    expect(by.Jimmy).toMatchObject({ status: 'awaiting_approval', isApprover: true });
    expect(state.approvals.filter((a) => a.state === 'pending').map((a) => a.id)).toEqual(['WO-3']);
    expect(state.needsYou.map((n) => n.kind)).toEqual(['approval', 'blocked']);
    const counts = {};
    for (const t of state.tasks) counts[t.state] = (counts[t.state] ?? 0) + 1;
    expect(counts).toEqual({ done: 5, in_progress: 1, todo: 1, in_review: 1 });
    expect(state.handoffs).toMatchObject([{ from: 'backend', to: 'tester' }]);

    const file = JSON.parse(fs.readFileSync(path.join(projectDir, 'agent-status.json'), 'utf8'));
    for (const k of ['updatedAt', 'agents', 'approvals', 'tasks', 'log']) expect(file).toHaveProperty(k);
    expect(file).toEqual(state);
    expect(fs.readdirSync(projectDir).filter((f) => f.includes('tmp'))).toEqual([]);
  });

  it('shows everyone idle for the empty fixture', async () => {
    const projectDir = copyFixture('empty');
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist') });
    const state = await (await fetch(`${base}/api/team`)).json();
    expect(state.agents.map((a) => a.status)).toEqual(Array(6).fill('idle'));
    expect(state.tasks).toEqual([]);
  });

  it('answers 500 with a hint for an invalid team.json', async () => {
    const projectDir = copyFixture('bad-team');
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist') });
    const res = await fetch(`${base}/api/team`);
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.hint).toBe('Fix .team/team.json and this page will reload.');
    expect(body.error).toMatch(/JSON/);
    expect(body.kind).toBe('team');
  });

  it('reflects an event appended between two requests', async () => {
    const projectDir = copyFixture('busy');
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist') });
    const before = await (await fetch(`${base}/api/team`)).json();
    appendEvent(path.join(projectDir, '.team', 'events.jsonl'),
      { type: 'status', source: 'cli', agent: 'tester', status: 'working', task: 'T-004', progress: 5 }, fixedNow());
    const after = await (await fetch(`${base}/api/team`)).json();
    expect(before.agents.find((a) => a.name === 'Tester').status).toBe('idle');
    expect(after.agents.find((a) => a.name === 'Tester').status).toBe('working');
  });

  it('works without an events.jsonl and without a dist folder', async () => {
    const projectDir = copyFixture('empty');
    expect(fs.existsSync(path.join(projectDir, '.team', 'events.jsonl'))).toBe(false);
    const base = await start({ projectDir, distDir: path.join(projectDir, 'missing-dist') });
    expect((await fetch(`${base}/api/team`)).status).toBe(200);
    expect((await fetch(`${base}/`)).status).toBe(404);
  });

  it('warns once per distinct warning, not on every poll', async () => {
    const projectDir = copyFixture('busy');
    fs.appendFileSync(path.join(projectDir, '.team', 'events.jsonl'), 'not json\n');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist') });
    for (let i = 0; i < 3; i++) await fetch(`${base}/api/team`);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/malformed JSON/);
  });

  it('carries ids on every agent', async () => {
    const projectDir = copyFixture('busy');
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist') });
    const state = await (await fetch(`${base}/api/team`)).json();
    expect(state.agents.map((a) => a.id)).toEqual(['planner', 'backend', 'frontend', 'tester', 'reviewer', 'jimmy']);
  });

  it('still serves state when rotation throws, warning once', async () => {
    const projectDir = copyFixture('busy');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let t = Date.parse(FIXTURE_NOW);
    const rotate = () => { throw new Error('disk full'); };
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist'), rotate, now: () => new Date(t) });
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${base}/api/team`);
      expect(res.status).toBe(200);
      t += 61_000;
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/rotation failed: disk full/);
  });

  it('warns once when agent-status.json cannot be written', async () => {
    const projectDir = copyFixture('busy');
    fs.mkdirSync(path.join(projectDir, 'agent-status.json')); // a directory blocks the rename
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist') });
    for (let i = 0; i < 3; i++) expect((await fetch(`${base}/api/team`)).status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/agent-status\.json/);
  });

  it('rotates at most once per 60 seconds of server time', async () => {
    const projectDir = copyFixture('busy');
    const log = path.join(projectDir, '.team', 'events.jsonl');
    let t = Date.parse(FIXTURE_NOW);
    const base = await start({ projectDir, distDir: path.join(projectDir, 'nodist'), maxBytes: 100, now: () => new Date(t) });
    const archives = () => fs.readdirSync(path.join(projectDir, '.team')).filter((f) => f.startsWith('events-')).length;

    await fetch(`${base}/api/team`);
    expect(archives()).toBe(1);
    const big = { type: 'tool_use', source: 'cli', agent: 'backend', action: 'x'.repeat(300) };
    appendEvent(log, big, new Date(t));
    t += 30_000;
    await fetch(`${base}/api/team`);
    expect(archives()).toBe(1);
    t += 31_000;
    await fetch(`${base}/api/team`);
    expect(archives()).toBe(2);
  });
});

describe('static files', () => {
  it('serves files with the right content type and SPA fallback', async () => {
    const distDir = distWith({
      'index.html': '<h1>office</h1>', 'assets/app.js': 'x', 'assets/app.css': 'x', 'a.svg': '<svg/>',
      'a.png': 'x', 'f.woff2': 'x', 'm.json': '{}',
    });
    const base = await start({ projectDir: copyFixture('empty'), distDir });
    const types = { '/': 'text/html', '/assets/app.js': 'javascript', '/assets/app.css': 'text/css', '/a.svg': 'image/svg+xml',
      '/a.png': 'image/png', '/f.woff2': 'font/woff2', '/m.json': 'application/json' };
    for (const [p, type] of Object.entries(types)) {
      const res = await fetch(base + p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get('content-type'), p).toContain(type);
    }
    const spa = await fetch(`${base}/some/route`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toBe('<h1>office</h1>');
  });

  it('returns 404 for a missing path when there is no index.html', async () => {
    const base = await start({ projectDir: copyFixture('empty'), distDir: distWith({ 'a.js': 'x' }) });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it('refuses paths that escape distDir, plain or encoded', async () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'package.json'), '{"secret":true}');
    const distDir = path.join(root, 'dist');
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(distDir, 'index.html'), 'ok');
    const base = await start({ projectDir: copyFixture('empty'), distDir });
    // fetch normalises dots, so send raw requests
    const raw = (p) => new Promise((resolve, reject) => {
      const u = new URL(base);
      http.get({ host: u.hostname, port: u.port, path: p }, (res) => {
        let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
    for (const p of ['/../package.json', '/%2e%2e%2fpackage.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/a/%2e%2e/%2e%2e/package.json', '/%00']) {
      const res = await raw(p);
      expect(res.status, p).toBe(404);
      expect(res.body, p).not.toContain('secret');
    }
  });

  it('answers 405 to non-GET requests', async () => {
    const base = await start({ projectDir: copyFixture('empty'), distDir: distWith({ 'index.html': 'x' }) });
    for (const url of ['/api/team', '/']) {
      const res = await fetch(base + url, { method: 'POST' });
      expect(res.status, url).toBe(405);
    }
  });
});
