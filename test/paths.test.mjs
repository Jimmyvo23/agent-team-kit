import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findProjectRoot, logPath } from '../lib/paths.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atk-'));

test('findProjectRoot walks up to the folder containing .team', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.team'));
  const deep = path.join(root, 'a', 'b');
  fs.mkdirSync(deep, { recursive: true });
  expect(findProjectRoot(deep)).toBe(root);
  expect(findProjectRoot(root)).toBe(root);
});

test('findProjectRoot returns null when no .team exists', () => {
  const root = tmp();
  expect(findProjectRoot(root)).toBeNull();
});

test('findProjectRoot works in a directory with spaces', () => {
  const root = path.join(tmp(), 'Claude projects', 'My App');
  fs.mkdirSync(path.join(root, '.team'), { recursive: true });
  const deep = path.join(root, 'src dir');
  fs.mkdirSync(deep);
  expect(findProjectRoot(deep)).toBe(root);
});

test('logPath points at .team/events.jsonl', () => {
  expect(logPath('/x/y z')).toBe(path.join('/x/y z', '.team', 'events.jsonl'));
});
