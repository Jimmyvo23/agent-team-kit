# S-0: what Claude Code hooks really receive

- Claude Code version tested: 2.1.290
- Date: 2026-10-06
- Status: decided; Task 8 builds the hook mapper from this document and the fixtures in `test/fixtures/hooks/`.

## Method

I created a throwaway Git repo (not committed) with a hook config that pipes every hook input to `jq -c . >> hook-dump.jsonl`, and a tiny test subagent `spike-helper` (model haiku, tools Edit, Write, Bash). Hooks configured: `PreToolUse` and `PostToolUse` matched on `Agent|Task|Edit|Write|Bash`, plus `SubagentStart` and `SubagentStop`. I confirmed the event names against the current hooks docs first (https://docs.claude.com/en/docs/claude-code/hooks), which list `SubagentStart` and `SubagentStop`. The page was fetched with `curl -sL` (the raw HTML, about 2.9 MB, was searched for the event names and the `agent_id` / `agent_type` field descriptions). It was not read in full, and the behaviour below comes from the captured inputs, not from the docs.

Two headless runs (`claude -p`, haiku, `--permission-mode acceptEdits`):

1. Foreground: the main session started `spike-helper` in the foreground; the subagent wrote a file and ran `echo hi`; then the main session wrote a file and ran `echo main`.
2. Background: the main session started `spike-helper` with `run_in_background: true`, then kept working (five `echo` calls and a Write) until the background agent finished.

Both runs completed normally. Each fixture is one real captured input. Fixtures are real captured inputs with personal paths, session ids, prompt ids, tool use ids and agent ids replaced by stable fake values of the same shape. Field names and structure are untouched.

## The five answers

1. **Subagent type at start.** `SubagentStart` input has `agent_type` (for example `"spike-helper"`) and `agent_id`. The same value is also in `PreToolUse` on the agent tool at `tool_input.subagent_type`. Fixtures: `subagent-start.json`, `subagent-start-background.json`, `pre-agent.json`.
2. **`PostToolUse` on the agent tool for background subagents.** It fires at launch, not at finish. It arrived right after `SubagentStart`, with `duration_ms` of 8, `tool_response.status` of `"async_launched"` and `tool_response.isAsync` of `true`. The agent id is at `tool_response.agentId`. The finish is signalled only by `SubagentStop`. Fixtures: `post-agent-background.json`, `subagent-stop-background.json`. For foreground agents, `PostToolUse` fires at finish with `tool_response.status` of `"completed"` (`post-agent.json`).
3. **`SubagentStop` identifies the subagent.** Yes: `agent_id` and `agent_type`, plus `agent_transcript_path` and `last_assistant_message`. Fixture: `subagent-stop.json`.
4. **Tool calls inside a subagent identify the subagent.** Yes. `PreToolUse` and `PostToolUse` inputs carry `agent_id` and `agent_type` at the top level only when the call is made inside a subagent. Calls from the main session have neither field. Fixtures: `tool-in-subagent.json` and `tool-in-subagent-background.json` (present), `tool-in-main.json` (absent).
5. **Agent tool name.** `Agent` (`tool_name: "Agent"`). I did not observe `Task` in 2.1.290; the mapper should still accept both `Agent` and `Task` for older versions.

## Other observations

- Event order, foreground run (from the dump, no single fixture): `PreToolUse(Agent)`, `SubagentStart`, the subagent's tool events, `SubagentStop`, `PostToolUse(Agent)`, then the main session's tool events.
- Event order, background run (from the dump): `PreToolUse(Agent)`, `SubagentStart`, `PostToolUse(Agent)` (launch), then main and subagent tool events interleaved, then `SubagentStop`. The interleaving itself is observed but not captured as a fixture; the individual events are (`subagent-start-background.json`, `post-agent-background.json`, `tool-in-subagent-background.json`, `subagent-stop-background.json`).
- In the background run, `SubagentStop.background_tasks` listed the agent itself with `status: "running"` (`subagent-stop-background.json`). In the foreground run it was `[]` (`subagent-stop.json`). Do not use that list to decide whether an agent finished; the event itself means it stopped.
- `tool_use_id` links `PreToolUse` and `PostToolUse` for the same call.
- `tool_response.agentId` (agent tool, camelCase) equals `agent_id` (subagent events, snake_case). It is present in both the launch-time background post (`post-agent-background.json`) and the foreground finish post (`post-agent.json`).

## Chosen hook to event mapping (for Task 8)

| Hook event + matcher | Kit event type | Instance correlation | Summary |
|---|---|---|---|
| `SubagentStart` (no matcher) | `agent_start` | `agent_id` | `agent_type` (see decision 2) |
| `SubagentStop` (no matcher) | `agent_stop` | `agent_id` | `last_assistant_message`, trimmed |
| `PostToolUse` matched `Edit\|Write\|Bash` | `tool_use` | `agent_id` if present | tool name plus `tool_input.file_path` (Edit, Write) or `tool_input.command` (Bash) |
| `PreToolUse` / `PostToolUse` matched `Agent\|Task` | not used for the log | n/a | n/a |

### Decision 1: how an event reaches a team.json desk

- The desk is resolved from `agent_type`, matched case-insensitively after trimming, against the desk names in team.json (for example `Backend` matches `backend`). `agent_id` is random hex and can never match a desk name; it is used only to correlate the start, stop and tool events of one instance.
- If `agent_type` matches no desk (including generic types such as `general-purpose`), the event goes to the visitor desk.
- Two parallel instances of the same type resolve to the same desk. They stay distinct by `agent_id` (so one stopping does not end the other), but they share one desk. Parallel runs were not tested here.
- Tool events with no `agent_id` come from the main session. They map to the Planner desk, because the main session is the Planner.
- Tool events with an `agent_id` that has no matching earlier `SubagentStart` (unknown instance) are shown as "team activity" (the spec 6.5 fallback line), not guessed onto a desk.

### Decision 2: agent tool hooks and the summary

`PostToolUse` on the agent tool does link to an instance: it has `tool_response.agentId` together with `tool_input.description` and `tool_use_id` (`post-agent-background.json` at launch, `post-agent.json` at finish). `PreToolUse` has the description but no agent id. We still choose to ignore the agent tool hooks and use `agent_type`-only summaries for `agent_start`, because the lifecycle then comes from just two events that behave the same for foreground and background agents, with no join step or ordering assumption between hooks. If a later task wants richer start lines, it can join `PostToolUse(Agent)` to `SubagentStart` by `tool_response.agentId` equal to `agent_id` and use `tool_input.description`. Note that for foreground agents that post event arrives at finish, after `SubagentStop`.

### Tool summary details

For `tool_use`, the summary is `tool_input.file_path` for Edit and Write and `tool_input.command` for Bash. Task 8 should collapse whitespace and truncate to 120 characters with an ellipsis, and never include `tool_response` content.

## Is the spec 6.5 fallback needed?

Not needed for attribution when `agent_id` is present: that was observed for a single subagent, in both foreground and background runs, and each tool call carries its own `agent_id`. Parallel subagents were not verified. Keep the spec 6.5 "team activity" fallback for tool events whose `agent_id` is absent-but-unexplained or unknown (no matching start), as in decision 1. Absent `agent_id` on its own is not unknown: it means the main session and goes to the Planner desk.
