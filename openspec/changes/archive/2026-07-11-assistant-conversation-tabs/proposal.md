## Why

The assistant is a single conversation with a single Claude session. Real work needs several conversations in parallel — one to plan, one to implement, one to review — often with **different agents** (a reviewer, an architect, a test-writer). And those conversations aren't isolated: the user wants to carry context between them ("in conversation 2, use the test we wrote in conversation 1", or highlight something in conversation 1 and hand it to conversation 2). Today none of that is possible: switching topics means losing the current session, and there's no way to reference one chat from another.

Separately, the editor tab strip is fixed-order: tabs appear in open-order and can't be reorganized. VS Code lets you drag tabs left/right across the strip; we should too.

## What Changes

- **Conversation tabs.** The assistant sidebar gains a tab strip: ＋ opens a new conversation, tabs are renamable and closable, and each tab is an independent Claude session with its own transcript. Inactive conversations stay alive (their session + transcript persist) while hidden.
- **Per-tab agents.** Each conversation has an **agent** — chosen from a single picker offering both the session's real Claude Code **subagents** (from `init.agents`, e.g. Explore/Plan) and VortSpec **custom presets** (name + role/system-prompt + model + toolset, with a few shipped defaults and user-defined ones). The agent shapes the conversation's system prompt, model, and tools.
- **Cross-conversation context.** A conversation can pull another's content two ways:
  - **Reference by label** — the `@`-mention picker lists open conversations (`@Conversation 1`); selecting one attaches it, and on send the referenced conversation's **most recent transcript (capped)** is injected as context.
  - **Highlight → send** — selecting text inside a message shows a "Send to ▾" action; picking a target conversation adds the highlighted text as an attachment chip in that conversation.
- **Reorderable editor tabs.** Editor (code) tabs can be dragged left/right to reorganize them across the strip.

## Capabilities

### New Capabilities
- `assistant-conversation-tabs`: multiple independent, labelled, renamable/closable conversation tabs in the assistant, each an isolated Claude session that persists while inactive; per-tab agent selection (Claude Code subagents + custom presets).
- `assistant-cross-conversation-context`: referencing another conversation by label (`@`-mention → capped-transcript injection) and sending a highlighted selection from one conversation to another as context.
- `ide-editor-tab-reorder`: drag-to-reorder for the editor tab strip.

## Impact

- **@vortspec/ui**: extract the current `AssistantDock` body into a `Conversation` component (one `useAgentRun`), add a `ConversationTabs` shell (tab strip + a manager that keeps all conversations mounted); an agent picker; extend the `@`-mention menu with conversation references; a message-selection "send to conversation" action; the attachment expansion gains a "referenced conversation" kind. `AssistantDock` stays as the single-conversation entry (cockpit unaffected).
- **apps/ide**: host the `ConversationTabs` in the assistant sidebar; wire the message-selection action; supply the agent presets + the session's `agents`.
- **Editor tabs**: `useWorkspaceFiles` gains `reorder(fromPath, toPath)`; `EditorGroup` tab strip becomes drag-reorderable.
- **@vortspec/core**: `AgentRunOptions` already carries `appendSystemPrompt`/`model`/`allowedTools` — enough to express an agent; add an optional `agent` label passthrough only if needed for a Claude Code subagent invocation. No new engine logic.
- **Security/invariants**: unchanged — still the user's own non-bare `claude`, no keys; cross-conversation injection is local renderer state, capped, and only on explicit user reference.
- **Tests**: CT for opening/switching/closing conversation tabs with persisted transcripts, agent selection, `@conversation` referencing (capped transcript reaches the prompt), highlight→send, and editor-tab drag-reorder. Cockpit + all suites green.
