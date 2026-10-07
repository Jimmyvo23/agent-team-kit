import { test, expect } from 'vitest';
import { capColumn, LOBBY_MAX } from '../dashboard/src/lobby.ts';

test('lobby shows at most 3 tickets per column', () => {
  expect(LOBBY_MAX).toBe(3);
});

test('capColumn keeps the first 3 and counts the rest', () => {
  expect(capColumn([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
});

test('capColumn on an empty column', () => {
  expect(capColumn([])).toEqual({ shown: [], more: 0 });
});

test('capColumn with exactly the maximum has nothing more', () => {
  expect(capColumn(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b', 'c'], more: 0 });
});

test('capColumn honours a custom maximum and does not mutate its input', () => {
  const items = [1, 2, 3, 4];
  expect(capColumn(items, 1)).toEqual({ shown: [1], more: 3 });
  expect(items).toEqual([1, 2, 3, 4]);
});
