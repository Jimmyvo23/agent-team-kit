import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const AGENTS = ['backend', 'frontend', 'tester', 'reviewer'];

/** Tiny frontmatter parser: `key: value` lines between --- fences. */
function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('missing frontmatter');
  const front = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) front[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { front, body: m[2] };
}
const agent = (id) => parse(read(`agents/${id}.md`));
const front = (id) => agent(id).front;

describe('agent files', () => {
  test('every team.json member except planner has an agent file whose name matches', () => {
    const team = JSON.parse(read('templates/team.json'));
    const ids = team.members.map((m) => m.id).filter((id) => id !== 'planner');
    expect(ids.sort()).toEqual([...AGENTS].sort());
    for (const id of ids) {
      expect(front(id).name).toBe(id);
      expect(front(id).description.length).toBeGreaterThan(20);
    }
  });

  test('reviewer has no Edit or Write tool', () => {
    expect(front('reviewer').tools).not.toMatch(/\b(Edit|Write)\b/);
    expect(front('reviewer').tools).toMatch(/\bBash\b/);
  });

  test('builders and tester have the expected tools', () => {
    for (const id of ['backend', 'frontend', 'tester']) {
      for (const t of ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob']) {
        expect(front(id).tools).toMatch(new RegExp(`\\b${t}\\b`));
      }
    }
  });

  test('models: builders and tester sonnet, reviewer opus', () => {
    for (const id of ['backend', 'frontend', 'tester']) expect(front(id).model).toBe('sonnet');
    expect(front('reviewer').model).toBe('opus');
  });

  test('every agent file mentions team-status and .team/handoffs', () => {
    for (const id of AGENTS) {
      const { body } = agent(id);
      expect(body).toContain('node .team/bin/team-status.mjs');
      expect(body).toContain(`--agent ${id}`);
      expect(body).toContain('--reason');
      expect(body).toContain('.team/handoffs/');
      expect(body).toContain('handoff-template.md');
    }
  });

  test('every agent body has the five sections in order', () => {
    const order = ['Role', 'Boundaries', 'Skills to use', 'Reporting', 'Handoff'];
    for (const id of AGENTS) {
      const { body } = agent(id);
      const heads = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
      expect(heads).toEqual(order);
      expect(body.split('\n').length + 5).toBeLessThan(80);
    }
  });

  test('every agent states the git safety boundaries', () => {
    for (const id of AGENTS) {
      const { body } = agent(id);
      expect(body).toMatch(/never push to `?main`?/i);
      expect(body).toMatch(/never force-push/i);
      expect(body).toMatch(/never commit secrets/i);
      expect(body).toMatch(/feature branch/i);
    }
  });

  test('frontend names frontend-design and artifact-design', () => {
    const { body } = agent('frontend');
    expect(body).toContain('frontend-design:frontend-design');
    expect(body).toContain('artifact-design');
    expect(body).toMatch(/publishing rules/i);
  });

  test('skills use exact names', () => {
    for (const id of ['backend', 'frontend']) {
      expect(agent(id).body).toContain('superpowers:test-driven-development');
      expect(agent(id).body).toContain('superpowers:verification-before-completion');
      expect(agent(id).body).toContain('superpowers:receiving-code-review');
    }
    expect(agent('tester').body).toContain('superpowers:systematic-debugging');
    expect(agent('tester').body).toContain('superpowers:verification-before-completion');
    expect(agent('reviewer').body).toContain('superpowers:requesting-code-review');
  });

  test('tester limits edits to test files; reviewer is read-only', () => {
    expect(agent('tester').body).toMatch(/only (create or edit )?test files/i);
    expect(agent('reviewer').body).toMatch(/read-only/i);
  });
});

describe('planner files', () => {
  const planner = read('planner/planner.md');

  test('planner.md contains the 100-word summary rule, 2-failed-rounds escalation and per-agent approval', () => {
    expect(planner).toMatch(/100 words or fewer/);
    expect(planner).toMatch(/2 failed rounds/);
    expect(planner).toContain('team-status.mjs escalate');
    expect(planner).toMatch(/per agent/i);
    expect(planner).toContain('team-status.mjs approval');
    expect(planner).toContain('team-status.mjs decide');
    expect(planner).toMatch(/25%/);
    expect(planner).toContain('.team/work-order-template.md');
    expect(planner).toContain('.team/handoffs/');
    expect(planner.split('\n').length).toBeLessThan(150);
  });

  test('planner names its skills', () => {
    for (const s of ['superpowers:brainstorming', 'superpowers:writing-plans', 'superpowers:subagent-driven-development']) {
      expect(planner).toContain(s);
    }
  });

  test('work order template has the table columns', () => {
    const wo = read('planner/work-order-template.md');
    expect(wo).toMatch(/\| Agent \| Task \| Plan[^|]*\| Effort[^|]*\| Risk \|/);
    expect(wo).toMatch(/Recommendation/);
    expect(wo).toMatch(/Left out/i);
  });

  test('handoff template has the four sections', () => {
    const h = read('templates/handoff-template.md');
    for (const s of ['What changed', 'How to verify', 'Known gaps or risks', 'What the next agent needs']) {
      expect(h).toContain(`## ${s}`);
    }
  });

  test('claude-team-section is short, marker-free and points to planner.md', () => {
    const t = read('templates/claude-team-section.md');
    expect(t.trimEnd().split('\n').length).toBeLessThanOrEqual(25);
    expect(t).toContain('.team/planner.md');
    expect(t).toContain('team-status');
    expect(t).not.toMatch(/<!--/);
  });
});
