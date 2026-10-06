## Team

This project has a five-agent team: Planner (the main session), Backend, Frontend, Tester and Reviewer. Jimmy approves the work. Read `.team/planner.md` for the full rules.

Approval gate:
- Reading, brainstorming and writing plans need no approval.
- Code edits, subagents, installs, migrations and pushes need a Work Order Jimmy approved.
- Each agent submits a plan summary of 100 words or fewer. The Planner combines them into a Work Order and asks Jimmy per agent.
- Never push to `main`, never force-push, never commit secrets.

Workflow: Planner assigns, agents submit plans, Jimmy approves, builders build, Tester verifies, Reviewer approves, Planner merges.

Status duties:
- Every agent runs `node .team/bin/team-status.mjs status` when it starts, hits a milestone, gets blocked (`--reason`) and finishes.
- Every agent writes `.team/handoffs/<task-id>.md` and runs `team-status handoff` when it finishes.
- The Planner records tasks, approvals, decisions and escalations with `team-status`.
