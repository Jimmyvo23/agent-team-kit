#!/usr/bin/env node
// @ts-check
// Claude Code hook recorder. Usage: node record.mjs <agent-start|agent-stop|tool>
// Reads the hook input JSON on stdin and appends one event to <project>/.team/events.jsonl.
// Contract: print NOTHING (stdout may reach Claude's context) and ALWAYS exit 0.
import { pathToFileURL } from 'node:url';

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Pure mapping from a hook input to a kit event, or null to ignore.
 * @param {string} kind
 * @param {any} input
 * @returns {Record<string, string> | null}
 */
export function mapHookInput(kind, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const type = str(input.agent_type).trim().toLowerCase();

  if (kind === 'agent-start') return type ? { type: 'agent_start', agent: type, source: 'hook' } : null;
  if (kind === 'agent-stop') return type ? { type: 'agent_stop', agent: type, source: 'hook' } : null;
  if (kind !== 'tool') return null;

  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  let action = '';
  if (input.tool_name === 'Edit' || input.tool_name === 'Write') {
    const base = str(ti.file_path).split(/[\\/]/).filter(Boolean).pop();
    if (base) action = `Editing ${base}`;
  } else if (input.tool_name === 'Bash') {
    const words = str(ti.command).trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    if (words) action = `Running ${words}`;
  }
  if (!action) return null;

  // Subagent -> its type; main session (no agent_id) -> planner; unknown instance -> team.
  const agent = type || (input.agent_id ? 'team' : 'planner');
  return { type: 'tool_use', agent, action, source: 'hook' };
}

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve) => {
    /** @type {Buffer[]} */ const chunks = [];
    process.stdin.on('data', (c) => chunks.push(Buffer.from(c)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

async function run() {
  try {
    const kind = process.argv[2] ?? '';
    const dir = process.env.CLAUDE_PROJECT_DIR;
    const raw = await readStdin();
    if (!dir) return;
    const event = mapHookInput(kind, JSON.parse(raw));
    if (!event) return;
    const fs = await import('node:fs');
    const path = await import('node:path');
    if (!fs.statSync(path.join(dir, '.team'), { throwIfNoEntry: false })?.isDirectory()) return;
    const { appendEvent } = await import('../lib/events.mjs');
    const { logPath } = await import('../lib/paths.mjs');
    appendEvent(logPath(dir), event);
  } catch {
    // Swallow everything: a hook must never print or fail.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().finally(() => process.exit(0));
}
