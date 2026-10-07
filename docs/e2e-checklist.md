# End-to-end checklist (Task 16)

Run on 2026-10-07 with Claude Code 2.1.290, Node 24.21.0, macOS.
Trial repo: a local-only Git repo at `~/Desktop/Claude projects/kit trial` (path contains a space).
Evidence: the trial's `.team/events.jsonl` (74 events) and `/api/team` responses.

| # | Expectation | Result | Evidence |
|---|---|---|---|
| 1 | Installer shows checks and a preview; answering n writes nothing | Pass | 17 planned files; "No changes made"; `git status` clean |
| 1b | Answering y installs; a second run reports nothing to do | Pass | "Installed."; "Nothing to do … everything is up to date" |
| 1c | Installed `node .team/bin/team-status.mjs` runs from the trial repo | Pass | `status --agent planner --status idle` appended one event |
| 2 | Office opens with every room "On a break" | Pass | `/api/team`: all six agents idle, needsYou 0, project "kit trial" |
| 3a | Claude Code accepts the hook settings (SubagentStart/SubagentStop without matcher, PostToolUse matcher) | Pass | `agent_start` / `agent_stop` events from source `hook` for backend and tester |
| 3b | Approval gate: one approval per agent, Jimmy waiting, then decided | Pass | `approval_requested` WO-1-backend and WO-1-tester; `approval_decided` approved for both |
| 3c | Backend "Working" with a last action | Partial | status working and hook `tool_use` attributed to backend, but the action text is `Running cd "/Users/kienvo/Desktop/Claude` (bug B-1) |
| 3d | Handoff Backend → Tester | Pass | `handoff` backend → tester, file `.team/handoffs/T-001.md` |
| 3e | Tester "Working", then both "Finished" | Pass | tester `status working`, then `done`; both `agent_stop` |
| 3f | T-001 ticket ends in Done | Pass | `task` T-001 state done |
| 3g | Tool use in a subagent lands on that agent's desk | Pass | `tool_use` events with agent backend / tester during their runs; main session → planner |
| 3h | Visual: sign, folder animation, plaques, lobby in the browser | Pass | Observed by Jimmy: yellow room and sign, Backend → Tester folder with "New from Backend", Working → Finished, T-001 in Done |
| 3i | Two subagents running at the same time | Not exercised | The trial task ran agents one after another; S-0's "team activity" fallback stays untested |

## Bugs found

- **B-1 (Backend):** agents prefix shell commands with `cd "<project path>" &&`, so every Bash action is recorded as `Running cd "<first part of the path>`. The action text never shows the real command and leaks a fragment of the local path. Fix: in `hooks/record.mjs`, skip leading `cd <dir> &&` / `cd <dir>;` segments (handling quoted paths) and describe the first real command.

## Notes

- The trial Planner ran the task twice (WO-1, then WO-2 after noticing T-001 was already done). Both runs produced the full expected event sequence.
- The trial Planner created `.team/work-orders/` and `.team/archive/` folders on its own; the kit neither creates nor ignores them.
