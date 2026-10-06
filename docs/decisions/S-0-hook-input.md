# S-0: what Claude Code hooks really receive

- Claude Code version tested: 2.1.290
- Date: 2026-10-06
- Status: decided; Task 8 builds the hook mapper from this document and the fixtures in `test/fixtures/hooks/`.

## Method

I created a throwaway Git repo (not committed) with a hook config that pipes every hook input to `jq -c . >> hook-dump.jsonl`, and a tiny test subagent `spike-helper` (model haiku, tools Edit, Write, Bash). Hooks configured: `PreToolUse` and `PostToolUse` matched on `Agent|Task|Edit|Write|Bash`, plus `SubagentStart` and `SubagentStop`. I confirmed the event names against the current hooks docs first (https://docs.claude.com/en/docs/claude-code/hooks), which list `SubagentStart` and `SubagentStop`.

Two headless runs (`claude -p`, haiku, `--permission-mode acceptEdits`):

1. Foreground: the main session started `spike-helper` in the foreground; the subagent wrote a file and ran `echo hi`; then the main session wrote a file and ran `echo main`.
2. Background: the main session started `spike-helper` with `run_in_background: true`, then kept working (five `echo` calls and a Write) until the background agent finished.

Both runs completed normally, so every case was observed. Fixtures are real captured inputs with personal paths, session ids, prompt ids, tool use ids and agent ids replaced by stable fake values of the same shape. Field names and structure are untouched.

## The five answers

1. **Subagent type at start.** `SubagentStart` input has `agent_type` (for example `"spike-helper"`) and `agent_id`. The same value is also in `PreToolUse` on the agent tool at `tool_input.subagent_type`. Fixtures: `subagent-start.json`, `pre-agent.json`.
2. **`PostToolUse` on the agent tool for background subagents.** It fires at launch, not at finish. It arrived right after `SubagentStart`, with `duration_ms` of 8, `tool_response.status` of `"async_launched"` and `tool_response.isAsync` of `true`. The agent id is at `tool_response.agentId`. The finish is signalled only by `SubagentStop`. Fixture: `post-agent-background.json`. For foreground agents, `PostToolUse` fires at finish with `tool_response.status` of `"completed"` (`post-agent.json`).
3. **`SubagentStop` identifies the subagent.** Yes: `agent_id` and `agent_type`, plus `agent_transcript_path` and `last_assistant_message`. Fixture: `subagent-stop.json`.
4. **Tool calls inside a subagent identify the subagent.** Yes. `PreToolUse` and `PostToolUse` inputs carry `agent_id` and `agent_type` at the top level only when the call is made inside a subagent. Calls from the main session have neither field. Fixtures: `tool-in-subagent.json` (present), `tool-in-main.json` (absent).
5. **Agent tool name.** `Agent` (`tool_name: "Agent"`). I did not observe `Task` in 2.1.290; the mapper should still accept both `Agent` and `Task` for older versions.

## Other observations

- Event order, foreground run: `PreToolUse(Agent)`, `SubagentStart`, the subagent's tool events, `SubagentStop`, `PostToolUse(Agent)`, then the main session's tool events.
- Event order, background run: `PreToolUse(Agent)`, `SubagentStart`, `PostToolUse(Agent)` (launch), then main and subagent tool events interleaved, then `SubagentStop`. Interleaved events are told apart only by the presence and value of `agent_id`.
- In the background run, `SubagentStop` carried `background_tasks` listing the agent itself with `status: "running"`. Do not use that list to decide whether the agent finished; the event itself means it stopped.
- `tool_use_id` links `PreToolUse` and `PostToolUse` for the same call.
- `tool_response.agentId` (agent tool, camelCase) equals `agent_id` (subagent events, snake_case).

## Chosen hook to event mapping (for Task 8)

| Hook event + matcher | Kit event type | Agent id from | Summary from |
|---|---|---|---|
| `SubagentStart` (no matcher) | `agent_start` | `agent_id` (type: `agent_type`) | `agent_type` (the description lives on the agent tool call, see note) |
| `SubagentStop` (no matcher) | `agent_stop` | `agent_id` (type: `agent_type`) | `last_assistant_message` (trimmed) |
| `PostToolUse` matched `Edit\|Write\|Bash` | `tool_use` | `agent_id` if present, else the main session | `tool_name` plus `tool_input.file_path` or `tool_input.command` |
| `PreToolUse` / `PostToolUse` matched `Agent\|Task` | not used for the log | n/a | n/a |

Note: `PreToolUse` on the agent tool has `tool_input.description`, which is a nicer summary for `agent_start`, but it carries no agent id, so it cannot be tied to `SubagentStart` reliably when several launch together. Task 8 should use `SubagentStart` and `SubagentStop` for agent lifecycle and ignore the agent tool hooks. This also means background agents need no special handling: start and stop events behave the same for foreground and background.

## Is the spec 6.5 fallback needed?

No. Tool calls inside a subagent carry `agent_id` and `agent_type`, so each `tool_use` event can be placed on the right desk even when several subagents run in parallel. The "most recently started subagent" guess and the "team activity" line are not needed for events from this Claude Code version. Keep a cheap safety net only for tool events with no `agent_id` (they belong to the main session, not a subagent). Limits of this verification: one subagent type, one subagent at a time per run. Parallel subagents were not exercised, but the field is per call, so I expect no change.
