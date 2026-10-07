# agent-team-kit

A kit that installs a five-role Claude Code team into a project, plus a local "office" dashboard that shows who is doing what.

The roles are Planner (the main Claude Code session), Backend, Frontend, Tester and Reviewer. A human approver (Jimmy in the examples) approves every Work Order before anyone builds. The kit adds:

- four subagent files (Backend, Frontend, Tester, Reviewer) in `.claude/agents/`
- Planner rules and a Work Order template in `.team/`
- hooks that record what the agents do to a local log
- a small command, `team-status`, that agents use to report status, tasks and approvals
- the office dashboard, which you run from this repo and point at a project

The design is in `docs/superpowers/specs/`.

## Prerequisites

- Node 20 or newer, and Git
- Claude Code
- The Superpowers and frontend-design plugins, installed in Claude Code with `/plugin`
- The target project must be a Git repository

The installer checks Node, that the target is a Git repository, and the two plugins. It stops with a plain message if something is missing. It does not check that Git or Claude Code are installed.

## Install, update and uninstall

Run these from this repo. Paths with spaces need quotes.

```
node install.mjs --target ../CookNeighbour
```

It prints every change it will make and asks `Apply these changes? (y/n)`. Add `--yes` to skip that question. Nothing is written until you say yes.

What it puts in the project:

- `.claude/agents/` with the four subagent files
- `.claude/settings.json` with three hooks added (your existing settings and hooks are kept; the first copy of your file is saved as `settings.json.bak`)
- `.team/bin/` with `team-status.mjs`, the hook script and their helpers
- `.team/planner.md`, `.team/work-order-template.md`, `.team/handoffs/handoff-template.md`
- `.team/team.json` (the team and the approver; edit it to rename people)
- `.team/kit-manifest.json` (what the kit installed, so update and uninstall are safe)
- a marked "Team" section in `CLAUDE.md` and a marked block in `.gitignore`

Update: pull the new kit and run the same command again. Files you have not touched are updated. If you edited a kit file, the installer shows how it differs and asks before replacing it (`--yes` never replaces a file you customised).

Uninstall:

```
node install.mjs --target ../CookNeighbour --uninstall
```

This removes the kit's files, hooks and marked blocks. It keeps `.team/team.json`, your handoffs in `.team/handoffs/`, `.claude/settings.json.bak` and the activity logs (`.team/events*.jsonl`). The whole marked block is removed from `.gitignore`, so the logs, `agent-status.json` and `.superpowers/` stop being git-ignored. Delete them or ignore them yourself before committing.

The installer refuses to run if `.team` or `.claude/settings.json` is a symlink, and it never writes or deletes through other symlinks. If `settings.json` is not valid JSON it stops without changing anything.

## Running the office

```
npm ci
npm run office -- --project ../CookNeighbour
```

Relative paths are taken from the folder where you run the command. Options: `--project <path>` (required, must contain `.team/`) and `--port <1-65535>` (default 4317). The first run builds the dashboard (`npm run build`), then it prints `Office is open at http://127.0.0.1:4317` and opens your browser. Press Ctrl+C to stop. If the port is busy, use `--port`.

The dashboard binds to `127.0.0.1` only, so nobody else on your network can see it. It reads `.team/events.jsonl` every 3 seconds and also writes `agent-status.json` at the project root (git-ignored).

## How the Planner workflow runs

1. You talk to Claude Code in the project. The main session is the Planner and follows `.team/planner.md`.
2. Before a batch of work, each agent that will work submits a plan summary of 100 words or fewer. The Planner combines them into a Work Order.
3. The Planner records one approval per agent per Work Order (for example `WO-3-backend` and `WO-3-frontend`) and asks you to approve, reject or approve with changes. The office shows these at the approver's desk.
4. After you approve, the builders work on a feature branch and open a pull request. The Tester verifies and the Reviewer is the final gate. The Planner merges and closes the issue.
5. Each agent writes `.team/handoffs/<task-id>.md` when it finishes, so the next agent does not need the story repeated.
6. After two failed rounds on one task, the Planner escalates to you.

## team-status reference

Agents and the Planner use it from the project root. Every call appends one line to `.team/events.jsonl`.

```
node .team/bin/team-status.mjs status --agent backend --status working --task T-004 --progress 40 --next "Write tests"
```

| Subcommand | Flags |
|---|---|
| `status` | `--agent <id> --status <status> [--task <id>] [--progress <0-100>] [--next <text>] [--reason <text>]` |
| `task` | `--id <id> --title <text> --owner <agent> --state <state> [--notes <text>]` |
| `approval` | `--id <id> --summary <text> [--agents a,b]` |
| `decide` | `--id <id> --state <state> [--note <text>]` |
| `handoff` | `--from <agent> --to <agent> --task <id> [--file <path>]` |
| `escalate` | `--task <id> --summary <text>` |

Values:

- Agent status: `idle`, `working`, `blocked`, `awaiting_approval`, `done`. Use `--reason` when blocked.
- Task state: `todo`, `in_progress`, `in_review`, `done`.
- Approval state (for `decide`): `approved`, `rejected`, `changes_requested`.

Ids are matched ignoring case, so `Backend` and `backend` are the same desk.

## Known limits

- **Hook data.** What the hooks receive was captured with Claude Code 2.1.290 (`docs/decisions/S-0-hook-input.md`). Other versions may differ. Parallel subagents were not tested; activity that cannot be tied to a known agent is shown as "team activity".
- **Agents may skip status calls.** The status duty is an instruction, not something enforced. The hooks still record when each agent starts and stops and which files and commands it touches, so the office shows those facts either way.
- **Hook text is not a redaction layer.** The log shows a short action such as "Editing app.ts" or "Running git status". It keeps only the program name and a second word when that word looks safe, but a command like `echo SECRET` would still show as `Running echo SECRET`. Do not treat the log as private.
- **Logs stay local.** `.team/events*.jsonl` and `agent-status.json` are git-ignored. The log is rotated while the office is running, when it passes about 5 MB.
- **One approval id per agent per Work Order.** The Planner records `WO-3-backend` and `WO-3-frontend` separately so each agent has its own decision.
- **The Reviewer comments rather than approves.** With a single GitHub account an author cannot approve their own pull request, so Reviewer verdicts are pull request comments.

## Repo decisions

- **Public repo.** GitHub Free only enforces branch protection on public repos, so this repo is public. Commit nothing personal or secret.
- **Branch protection on `main`.** Changes need a pull request and a passing `ci` check. Force pushes and deletions are blocked. Required approvals are 0 because this is a single-account repo and an author cannot approve their own pull request. Reviewer verdicts are pull request comments.
- **Plain CSS with tokens instead of Tailwind.** The dashboard styles use CSS custom properties, which keeps the build small and the themes easy to change.
- **`@types/node` as a dev dependency.** The end-to-end tests are type-checked with it.
- **No dependencies in installed code.** Everything copied into a project (`lib/`, `cli/`, `hooks/`) uses Node built-ins only.

## Development

```
npm ci
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Requires Node 20 or newer.
