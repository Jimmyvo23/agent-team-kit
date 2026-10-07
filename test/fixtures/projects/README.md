# Dashboard server fixtures

Copy a fixture (`fs.cpSync`) before running the server on it: the server writes
`agent-status.json` and may rotate the log. Run with `now = fixtureClock()` from
`fixture-clock.mjs`; `FIXTURE_NOW` is `2026-10-05T10:10:00.000Z`.

## busy (team.json is templates/team.json, project "CookNeighbour")
At FIXTURE_NOW:
- planner: working on T-010, 10%, updated 10:07, not stale.
- backend: working on T-004, progress 40, nextStep "Write the free-trial tests", updated 10:08, not stale.
- frontend: working on T-007, 30%, last event 10:00 so `stale` is true (10 minutes).
- tester: idle. reviewer: blocked, reason "Checks failing". jimmy (approver): awaiting_approval, "1 decision waiting".
- approvals: exactly one, `WO-3` (pending, agents [frontend], requested by planner).
- needsYou: 2 items, the approval WO-3 then the blocked reviewer. No escalations.
  That is: 5 done, 1 in_progress, 1 todo, 1 in_review (8 tasks in total).
- handoffs: one, backend to tester for T-003 at 10:03. No visitors.

## empty
team.json only (same team), no events. Everyone idle, no tasks.

## bad-team
team.json is invalid JSON. `/api/team` answers 500 with a hint.
