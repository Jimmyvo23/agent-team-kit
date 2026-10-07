import { test, expect } from 'vitest';
import { orderRooms } from '../dashboard/src/rooms.ts';
import { needsYouLine, needsYouTitle } from '../dashboard/src/labels.ts';

const agent = (id, extra = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), isApprover: false, ...extra });
const team = ['planner', 'backend', 'frontend', 'tester', 'reviewer'].map((id) => agent(id));
const jimmy = agent('jimmy', { isApprover: true });
const ids = (list) => list.map((a) => a.id);

test('orderRooms puts the approver at the end of the top row (3 columns)', () => {
  expect(ids(orderRooms([...team, jimmy], 3))).toEqual(['planner', 'backend', 'jimmy', 'frontend', 'tester', 'reviewer']);
});

test('orderRooms with 2 columns', () => {
  expect(ids(orderRooms([...team, jimmy], 2))).toEqual(['planner', 'jimmy', 'backend', 'frontend', 'tester', 'reviewer']);
});

test('orderRooms keeps visitors after the team', () => {
  const visitor = agent('bot', { isVisitor: true });
  expect(ids(orderRooms([...team, jimmy, visitor], 3)).slice(-2)).toEqual(['reviewer', 'bot']);
});

test('orderRooms with fewer members than columns puts the approver last', () => {
  expect(ids(orderRooms([team[0], jimmy], 3))).toEqual(['planner', 'jimmy']);
});

test('orderRooms without an approver returns the input order', () => {
  expect(ids(orderRooms(team, 3))).toEqual(ids(team));
});

test('needsYouTitle: plural, singular and zero', () => {
  expect(needsYouTitle('Jimmy', 2)).toBe('Jimmy, 2 things need you');
  expect(needsYouTitle('Jimmy', 1)).toBe('Jimmy, 1 thing needs you');
  expect(needsYouTitle('Jimmy', 0)).toBe('Jimmy, 0 things need you');
});

test('needsYouLine for each kind', () => {
  const agents = [...team, jimmy];
  expect(needsYouLine({ kind: 'approval', id: 'WO-3', summary: 'Booking form' }, agents))
    .toEqual({ title: 'WO-3 needs your decision', detail: 'Booking form' });
  expect(needsYouLine({ kind: 'blocked', id: 'reviewer', summary: 'Checks failing' }, agents))
    .toEqual({ title: 'Reviewer is stuck', detail: 'Checks failing' });
  expect(needsYouLine({ kind: 'escalation', id: 'T-009', summary: 'Two failed rounds' }, agents))
    .toEqual({ title: 'T-009 was escalated', detail: 'Two failed rounds' });
});

test('needsYouLine falls back to the id for an unknown agent', () => {
  expect(needsYouLine({ kind: 'blocked', id: 'ghost', summary: 'x' }, team).title).toBe('ghost is stuck');
});
