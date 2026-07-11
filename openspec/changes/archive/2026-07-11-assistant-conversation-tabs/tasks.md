# Tasks — Conversation tabs, per-tab agents, cross-conversation context, editor-tab reorder

Phased so each phase ships value and stays green (`pnpm build && pnpm test && pnpm lint`). Cockpit stays unchanged (single-conversation `AssistantDock`). Own non-bare `claude`; no keys.

## 1. Phase 1 — Reorderable editor tabs

- [x] 1.1 `useWorkspaceFiles`: add `reorder(fromPath, toPath)` that moves `fromPath` to before `toPath` in `files` (no-op for same path; keeps `activePath` + dirty state, which are keyed by path).
- [x] 1.2 `EditorGroup` tab strip: each tab is `draggable` (mime `application/vortspec-tab` carrying the path); drag-over shows an insertion indicator (left border / end bar); drop calls `reorder`. Distinct mime from the chat-attach drag, so tabs and chat attachments never cross.
- [x] 1.3 CT: with two tabs open, dragging one before another reorders the strip (asserts the new order); active/dirty state preserved (keyed by path).
- [x] 1.4 Gate green.

## 2. Phase 2 — Conversation tabs + per-tab agents

- [x] 2.1 `AssistantDock` (already a single conversation) gains optional agent props (`agent`/`onAgentChange`/`presets`) — backward-compatible, so it doubles as both the cockpit's standalone dock and each tab inside `ConversationTabs`. (No rename needed; lower-risk than a file move.)
- [x] 2.2 `ConversationTabs` shell: a tab strip (＋ new, double-click rename, close, an optional close-panel ×) that renders **all** conversations and toggles visibility (`hidden`) so inactive sessions/transcripts persist. Capped at 8. The IDE renders this in the assistant sidebar (cockpit still uses `AssistantDock` directly).
- [x] 2.3 Agent model (`ai/agents.ts` + `AgentPicker`): shipped presets (Build / Review / Plan) + the session's **subagents** (`run.model.session.agents`), grouped in one picker. Selecting an agent sets that conversation's `appendSystemPrompt` (merged with the user-name preamble), `model`, and `allowedTools` — on the first run and, re-applied via the send override, on follow-ups.
- [x] 2.4 New conversations default to the Build preset; the agent picker shows in each conversation's header.
- [x] 2.5 CT: two conversations with persistent, isolated transcripts (hidden-but-mounted); Review agent applies a read-only toolset + reviewer system prompt (asserted via recorded run options); rename + close a tab.
- [x] 2.6 Gate green; cockpit (desktop CT) unaffected.

## 3. Phase 3 — Cross-conversation context

- [x] 3.1 Each `AssistantDock` reports its transcript up (`onTranscript`); `ConversationTabs` holds a `transcripts` map and hands each conversation a registry (`list()` = other conversations, `transcript(id)`).
- [x] 3.2 `ChatAttachment` gains `conversation` (and `text`) kinds; the `@`-menu (`MentionOption` = conversation | file) lists open conversations by label alongside files; picking one adds a chip.
- [x] 3.3 `expandAttachments(atts, registry)` injects a referenced conversation's **capped, most-recent-first** transcript (`capTranscript`, ~2.5k-char cap) as a labelled block.
- [x] 3.4 Highlight → "Send to": selecting text in the transcript surfaces a floating `SendToControl` listing the other conversations; picking one routes the snippet via `sendSelectionTo(target, {text, from})` (a `text` attachment with the source label) and switches to the target so the chip is visible.
- [x] 3.5 CT: `@Conv…` in conversation 2 injects conversation 1's transcript into the sent prompt; highlighting text in one conversation and sending it to another adds the snippet there and it rides in that conversation's next prompt.
- [x] 3.6 Gate green.

## 4. Verification

- [x] 4.1 Full gate green (build/test/lint); cockpit unaffected; own `claude`, no keys.
- [ ] 4.2 End-to-end in the running IDE (user's review): multiple conversations with different agents, referencing one from another, highlight→send between tabs, and dragging editor tabs into a new order.

## 4. Verification

- [ ] 4.1 Full gate green (build/test/lint) across packages; cockpit unaffected; no keys; own `claude`.
- [ ] 4.2 End-to-end in the running IDE: multiple conversations with different agents, referencing one from another, highlight→send between tabs, and dragging editor tabs into a new order.
