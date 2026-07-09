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

- [ ] 3.1 A conversation registry from `ConversationTabs` (`list(): {id,label}[]`, `transcript(id): ChatMessage[]`), passed to each `Conversation`.
- [ ] 3.2 `ChatAttachment` gains a `conversation` kind (`{ kind:"conversation", convId, label }`); the `@`-menu lists open conversations (by label) alongside files; picking one adds the chip.
- [ ] 3.3 `expandAttachments`: a `conversation` attachment injects the referenced conversation's **capped, most-recent-first** transcript (hard char cap) as a labelled context block.
- [ ] 3.4 Highlight → "Send to ▾": selecting text inside a message shows a floating control; picking a target conversation appends a `selection`-kind attachment (the text, labelled with the source conversation) to that conversation via a manager `sendSelectionTo(target, {text, from})`; the target shows the chip on activation.
- [ ] 3.5 CT: `@Conversation 1` in conversation 2 injects conversation 1's recent transcript into the sent prompt (capped); highlighting text in one conversation and sending it to another adds the attachment there and it rides in that conversation's next prompt.
- [ ] 3.6 Gate green; docs (this change) updated to reflect the shipped behavior.

## 4. Verification

- [ ] 4.1 Full gate green (build/test/lint) across packages; cockpit unaffected; no keys; own `claude`.
- [ ] 4.2 End-to-end in the running IDE: multiple conversations with different agents, referencing one from another, highlight→send between tabs, and dragging editor tabs into a new order.
