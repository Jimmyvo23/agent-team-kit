import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPrereqs } from '../lib/install/checks.mjs';

let root, target, home;
const addPlugin = (market, name) =>
  mkdirSync(join(home, '.claude', 'plugins', 'cache', market, name), { recursive: true });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atk checks '));
  target = join(root, 'proj dir');
  home = join(root, 'home');
  mkdirSync(join(target, '.git'), { recursive: true });
  mkdirSync(home, { recursive: true });
  addPlugin('superpowers-marketplace', 'superpowers');
  addPlugin('claude-plugins-official', 'frontend-design');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (over = {}) => checkPrereqs({ targetDir: target, nodeVersion: 'v24.1.0', homeDir: home, ...over });

describe('checkPrereqs', () => {
  it('returns [] when everything is present', () => {
    expect(run()).toEqual([]);
  });
  it('accepts a version without the v prefix and Node 20', () => {
    expect(run({ nodeVersion: '20.0.0' })).toEqual([]);
  });
  it('flags Node below 20 with one message', () => {
    const m = run({ nodeVersion: 'v18.19.0' });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/Node/);
    expect(m[0]).toMatch(/20/);
  });
  it('flags a target that is not a Git repo', () => {
    rmSync(join(target, '.git'), { recursive: true });
    const m = run();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/git/i);
  });
  it('accepts .git as a file (worktree)', () => {
    rmSync(join(target, '.git'), { recursive: true });
    writeFileSync(join(target, '.git'), 'gitdir: /elsewhere\n');
    expect(run()).toEqual([]);
  });
  it('flags missing Superpowers only', () => {
    rmSync(join(home, '.claude', 'plugins', 'cache', 'superpowers-marketplace'), { recursive: true });
    const m = run();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/Superpowers/);
  });
  it('flags missing frontend-design only', () => {
    rmSync(join(home, '.claude', 'plugins', 'cache', 'claude-plugins-official'), { recursive: true });
    const m = run();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/frontend-design/);
  });
  it('does not accept a plain file named like the plugin', () => {
    rmSync(join(home, '.claude', 'plugins', 'cache', 'superpowers-marketplace'), { recursive: true });
    mkdirSync(join(home, '.claude', 'plugins', 'cache', 'm'), { recursive: true });
    writeFileSync(join(home, '.claude', 'plugins', 'cache', 'm', 'superpowers'), '');
    expect(run()).toHaveLength(1);
  });
  it('treats a missing cache dir as both plugins missing', () => {
    rmSync(join(home, '.claude'), { recursive: true });
    expect(run()).toHaveLength(2);
  });
  it('returns one message per problem', () => {
    rmSync(join(target, '.git'), { recursive: true });
    rmSync(join(home, '.claude'), { recursive: true });
    expect(run({ nodeVersion: 'v16.0.0' })).toHaveLength(4);
  });
});
