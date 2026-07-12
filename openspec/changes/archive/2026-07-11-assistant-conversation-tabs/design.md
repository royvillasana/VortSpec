## Context

The assistant sidebar (`@vortspec/ui/AssistantDock`) is one conversation: one `useAgentRun` (a `useReducer` over run events, subscribed to `api.onAgentEvent`/`onAgentRaw`, filtered by the current run id) drives one Claude session (`claude -p … --resume`). The IDE embeds it once, with the context system (`@`-mentions, drag-in, Open-in-Chat, attachments) and the shadcn/ai render components already in place. Editor tabs live in `useWorkspaceFiles.files` (an `OpenFile[]`) and render in `EditorGroup`'s tab strip.

Two established facts shape the design:
- **`useAgentRun` already isolates by run id.** Multiple instances coexist without cross-talk — each ignores events whose `runId` isn't its own. So N conversations = N `useAgentRun` instances, provided each conversation component stays mounted (unmounting loses its reducer state).
- **An "agent" is expressible with existing run options.** `AgentRunOptions` carries `appendSystemPrompt`, `model`, and `allowedTools`. A per-conversation agent is just a preset over those three. Claude Code subagents (from `init.agents`) are named; headless `-p` can't spawn as a subagent, but it can be instructed to adopt one via `appendSystemPrompt` ("Act as the <name> subagent: <role>").

## Goals / Non-Goals

**Goals**
- Independent, persistent, labelled conversation tabs; each an isolated Claude session with its own agent.
- One agent picker spanning Claude Code subagents + custom presets.
- Cross-conversation context by label reference (capped transcript) and by highlight→send.
- Drag-to-reorder editor tabs.
- Cockpit unaffected; all invariants intact (own `claude`, no keys, non-bare).

**Non-Goals**
- Persisting conversations across app restarts (session-scoped for v1; labels/agent can persist later).
- True parallel subagent orchestration (we instruct, not spawn).
- Auto-summarizing referenced conversations (capped transcript, per the chosen decision).
- Cross-*project* conversations (scoped to the open workspace).

## Decisions

### 1. Keep every conversation mounted; switch by visibility
`ConversationTabs` renders one `Conversation` per tab and toggles visibility (`hidden` / `display:none`) rather than mounting only the active one — so each conversation's `useAgentRun` reducer state (transcript, session id, streaming, steps) survives tab switches. A closed tab unmounts (its session is abandoned; Claude Code sessions are resumable by id but we don't persist ids in v1). **Why not lift all run state into one manager reducer?** It would re-implement `useAgentRun`'s event routing for N runs and lose the clean per-instance isolation; mounting-and-hiding reuses the existing hook unchanged. Trade-off: a handful of hidden components — negligible (they idle unless streaming).

### 2. `Conversation` extracted from `AssistantDock`; `AssistantDock` stays the single-tab entry
Refactor the dock body (transcript + composer + all the ai/* rendering + attachments) into `Conversation`, parameterized by `agent` and a `conversations` registry (for cross-refs). `AssistantDock` becomes a thin wrapper that renders exactly one `Conversation` (no tab strip) — the cockpit imports it unchanged. The IDE renders `ConversationTabs` (strip + N `Conversation`s). Shared props (project, userName, mcpConfigPath, showSession, liveContext, pendingRef) pass through.

### 3. Agent = a resolved preset over {label, systemPrompt, model?, allowedTools?}
```
interface Agent { id: string; label: string; source: "preset" | "subagent";
                  systemPrompt?: string; model?: string; allowedTools?: string[]; }
```
- **Custom presets** ship a few defaults (e.g. *Build* [modify tools], *Review* [read-only + a critique prompt], *Plan* [read-only + planning prompt]); users can add more (stored in profile prefs).
- **Subagents** are derived from `run.model.session.agents`: `{ label: name, source: "subagent", systemPrompt: "Act as the \"<name>\" subagent." }`.
- The picker (shadcn/ai Model-Selector-style dropdown) lists both, grouped. Selecting an agent sets the conversation's system prompt (merged with the user-name preamble), model (via the existing Model Selector / `--model`), and `allowedTools`. New conversations default to *Build* (or the last-used).

### 4. Cross-conversation reference → attachment of kind `conversation`
Extend `ChatAttachment` with a `conversation` kind (`{ kind: "conversation", convId, label }`). The `@`-menu, when the query matches an open conversation label, offers it alongside files. On send, `expandAttachments` pulls the referenced conversation's transcript from the registry and injects a **capped, most-recent-first** block:
```
[Referenced conversation "Conversation 1" — most recent first]
<user/assistant turns, newest first, truncated to ~2–3k chars>
```
The registry is a context object `{ list(): {id,label}[]; transcript(id): ChatMessage[] }` provided by `ConversationTabs` to each `Conversation`.

### 5. Highlight → "Send to" another conversation
Selecting text within a rendered message shows a small floating "Send to ▾" control (mirrors the editor's Open-in-Chat). Picking a target conversation appends a `selection`-kind attachment (the highlighted text, labelled with the source conversation) to that conversation's pending attachments. Implemented via the manager: `sendSelectionTo(targetConvId, { text, from })`. The target conversation shows the chip immediately (even while hidden) and surfaces it when activated.

### 6. Editor tab reorder = array move + HTML5 DnD
`useWorkspaceFiles` gains `reorder(fromPath, toPath)` that moves `fromPath` before `toPath` in `files`. `EditorGroup` tabs become `draggable`; dragging over a tab shows an insertion indicator; dropping calls `reorder`. Same `dataTransfer` pattern as the Explorer/attachments, with a tab-specific mime (`application/vortspec-tab`). Active tab and dirty state are unaffected (keyed by path, not index).

## Risks / Trade-offs
- **[Many hidden Monaco/streamdown trees]** → Conversations are lightweight (no Monaco); streamdown only renders when a conversation has content. Hidden tabs idle. Acceptable; cap the number of open conversations (e.g. 8) with a friendly message.
- **[Context-window blowup from references]** → capped injection (per decision), newest-first, with a hard char cap; the chip shows what's attached so it's transparent.
- **[Agent "subagent" is instruction-only headless]** → documented; the preset's system prompt makes the behavior explicit; not presented as true isolation.
- **[Shared AssistantDock refactor risks the cockpit]** → `AssistantDock` keeps its exact public props and single-conversation behavior; desktop CT must stay green.
- **[Reorder vs. the drag used for chat-attach]** → distinct mime types (`application/vortspec-tab` vs `application/vortspec-path`) so an editor tab never lands in the chat and vice-versa.

## Migration Plan
1. **Phase 1 — Editor tab reorder** (small, isolated): `reorder` + draggable tab strip + CT. Ships first.
2. **Phase 2 — Conversation tabs**: extract `Conversation`, add `ConversationTabs` (strip, mounted-and-hidden, new/rename/close), per-tab agent picker. `AssistantDock` wrapper unchanged for the cockpit.
3. **Phase 3 — Cross-conversation context**: `conversation` attachment kind + `@`-menu conversation entries + capped-transcript injection; highlight→"Send to" action + manager routing.
- **Rollback:** all additive; the IDE opts into `ConversationTabs`, the cockpit keeps single-conversation `AssistantDock`; tab reorder is a no-op if never dragged.

## Resolved Questions
- **Agent presets** → ship fixed defaults **and** read user-defined presets from profile prefs; a full preset editor is deferred.
- **Rename UX** → inline double-click on the tab label, like the Explorer.
- **Persist conversation labels/agents across restarts** → deferred (session-scoped for v1).
