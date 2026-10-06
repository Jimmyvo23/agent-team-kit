import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mapHookInput } from '../hooks/record.mjs';

const SCRIPT = fileURLToPath(new URL('../hooks/record.mjs', import.meta.url));
const fxPath = (n) => fileURLToPath(new URL(`./fixtures/hooks/${n}.json`, import.meta.url));
const fx = (n) => JSON.parse(fs.readFileSync(fxPath(n), 'utf8'));
const KINDS = ['agent-start', 'agent-stop', 'tool'];

test('maps start fixture to agent_start with the agent type as id', () => {
  expect(mapHookInput('agent-start', fx('subagent-start'))).toEqual({ type: 'agent_start', agent: 'spike-helper', source: 'hook' });
});
test('maps stop fixture to agent_stop', () => {
  expect(mapHookInput('agent-stop', fx('subagent-stop'))).toEqual({ type: 'agent_stop', agent: 'spike-helper', source: 'hook' });
});
test('background fixtures map like foreground ones', () => {
  expect(mapHookInput('agent-start', fx('subagent-start-background'))).toMatchObject({ type: 'agent_start', agent: 'spike-helper' });
  expect(mapHookInput('agent-stop', fx('subagent-stop-background'))).toMatchObject({ type: 'agent_stop', agent: 'spike-helper' });
  expect(mapHookInput('tool', fx('tool-in-subagent-background'))).toMatchObject({ type: 'tool_use', agent: 'spike-helper' });
});
test('start/stop without a usable agent_type return null', () => {
  for (const kind of ['agent-start', 'agent-stop']) {
    expect(mapHookInput(kind, {})).toBeNull();
    expect(mapHookInput(kind, { agent_type: '   ' })).toBeNull();
    expect(mapHookInput(kind, { agent_type: 5 })).toBeNull();
  }
});
test('tool in subagent uses agent_type; Bash keeps two words', () => {
  expect(mapHookInput('tool', fx('tool-in-subagent'))).toEqual({ type: 'tool_use', agent: 'spike-helper', action: 'Running echo hi', source: 'hook' });
});
test('tool in main session is attributed to planner; Write shows basename', () => {
  expect(mapHookInput('tool', fx('tool-in-main'))).toEqual({ type: 'tool_use', agent: 'planner', action: 'Editing main.txt', source: 'hook' });
});
test('agent_id without agent_type goes to team', () => {
  const input = { ...fx('tool-in-subagent') };
  delete input.agent_type;
  expect(mapHookInput('tool', input)).toMatchObject({ agent: 'team' });
});
test('agent_type is trimmed and lowercased', () => {
  expect(mapHookInput('agent-start', { agent_type: '  Backend ' })).toMatchObject({ agent: 'backend' });
  expect(mapHookInput('tool', { ...fx('tool-in-subagent'), agent_type: ' Tester\n' })).toMatchObject({ agent: 'tester' });
});
test('Bash never leaks beyond two words', () => {
  const r = mapHookInput('tool', { tool_name: 'Bash', tool_input: { command: '  npm   test -- --token=abc' } });
  expect(r.action).toBe('Running npm test');
  expect(mapHookInput('tool', { tool_name: 'Bash', tool_input: { command: 'ls' } }).action).toBe('Running ls');
});
test('Edit shows basename only', () => {
  expect(mapHookInput('tool', { tool_name: 'Edit', tool_input: { file_path: '/a/b/My File.ts' } }).action).toBe('Editing My File.ts');
});
test('missing fields or unrelated tools return null', () => {
  expect(mapHookInput('tool', { tool_name: 'Edit', tool_input: {} })).toBeNull();
  expect(mapHookInput('tool', { tool_name: 'Bash', tool_input: { command: '   ' } })).toBeNull();
  expect(mapHookInput('tool', { tool_name: 'Bash' })).toBeNull();
  expect(mapHookInput('tool', { tool_name: 'Read', tool_input: { file_path: '/x' } })).toBeNull();
});
test('agent tool fixtures return null for every kind', () => {
  for (const n of ['pre-agent', 'post-agent', 'post-agent-background']) {
    for (const k of KINDS) expect(mapHookInput(k, fx(n)), `${n}/${k}`).toBeNull();
  }
});
test('garbage input and unknown kind return null', () => {
  for (const v of [null, undefined, 'x', 5, []]) for (const k of KINDS) expect(mapHookInput(k, v)).toBeNull();
  expect(mapHookInput('nope', fx('subagent-start'))).toBeNull();
});

// ---- CLI ----
const base = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atk-hook-'));
const proj = () => path.join(base(), 'My Project');
const spawn = (kind, input, env) => {
  const e = { ...process.env, ...env };
  if (env.CLAUDE_PROJECT_DIR === undefined) delete e.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [SCRIPT, kind], { input, env: e, encoding: 'utf8' });
};
const silent = (r) => expect([r.status, r.stdout, r.stderr]).toEqual([0, '', '']);
const events = (dir) => {
  const p = path.join(dir, '.team', 'events.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

test('CLI: garbage stdin is silent, exit 0, nothing logged', () => {
  const dir = proj(); fs.mkdirSync(path.join(dir, '.team'), { recursive: true });
  silent(spawn('tool', 'not json', { CLAUDE_PROJECT_DIR: dir }));
  silent(spawn('tool', '', { CLAUDE_PROJECT_DIR: dir }));
  expect(events(dir)).toEqual([]);
});
test('CLI: missing .team does nothing and does not create it', () => {
  const dir = proj(); fs.mkdirSync(dir, { recursive: true });
  silent(spawn('agent-start', JSON.stringify(fx('subagent-start')), { CLAUDE_PROJECT_DIR: dir }));
  expect(fs.existsSync(path.join(dir, '.team'))).toBe(false);
});
test('CLI: CLAUDE_PROJECT_DIR unset is silent', () => {
  silent(spawn('agent-start', JSON.stringify(fx('subagent-start')), {}));
});
test('CLI: valid fixture in a path with a space appends exactly one event', () => {
  const dir = proj(); fs.mkdirSync(path.join(dir, '.team'), { recursive: true });
  silent(spawn('tool', JSON.stringify(fx('tool-in-subagent')), { CLAUDE_PROJECT_DIR: dir }));
  const ev = events(dir);
  expect(ev).toHaveLength(1);
  expect(ev[0]).toMatchObject({ type: 'tool_use', agent: 'spike-helper', action: 'Running echo hi', source: 'hook' });
});
test('CLI: ignored fixture appends nothing', () => {
  const dir = proj(); fs.mkdirSync(path.join(dir, '.team'), { recursive: true });
  silent(spawn('tool', JSON.stringify(fx('post-agent')), { CLAUDE_PROJECT_DIR: dir }));
  expect(events(dir)).toEqual([]);
});

// ---- template ----
test('templates/hooks.json has the three events with quoted command paths', () => {
  const h = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../templates/hooks.json', import.meta.url)), 'utf8'));
  expect(Object.keys(h).sort()).toEqual(['PostToolUse', 'SubagentStart', 'SubagentStop']);
  const cmd = (ev) => h[ev].flatMap((g) => g.hooks.map((x) => x.command));
  const want = (k) => `node "$CLAUDE_PROJECT_DIR/.team/bin/hooks/record.mjs" ${k}`;
  expect(cmd('SubagentStart')).toEqual([want('agent-start')]);
  expect(cmd('SubagentStop')).toEqual([want('agent-stop')]);
  expect(cmd('PostToolUse')).toEqual([want('tool')]);
  expect(h.PostToolUse[0].matcher).toBe('Edit|Write|Bash');
  for (const ev of Object.keys(h)) for (const g of h[ev]) for (const x of g.hooks) expect(x.type).toBe('command');
});
