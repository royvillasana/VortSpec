# Design — Profile & usage cockpit

## The usage source (the crux)

The invariant forbids proxying model traffic or storing credentials, and Anthropic
publishes no numeric plan limits — so we can't compute "remaining" ourselves. The
key finding: **`claude -p "/usage" --output-format json` is a local command** that
returns the exact percentages Claude shows (`num_turns: 0`, `total_cost_usd: 0`,
~2s), using the user's own login. So we mirror Claude's own numbers rather than
inventing any.

`usage-reader.ts` spawns `claude` with an argument array (no shell) from the home
dir, parses the JSON envelope's `result` text with `usage-parser.ts` (pure, unit-
tested), and returns a `UsageResult { available, headline, limits[], note, raw,
capturedAt, error }`. Everything is defensive: spawn failure, timeout (20s), a
non-JSON or unfamiliar format all resolve to a fix-it `error` string, never a
throw. Isolated as the single place that knows this CLI incantation (the CLI can
change).

`usage-parser.ts` matches `^<label>: <n>% used( · resets <when>)?$` per line and
picks up the headline + "Approximate…" note. The contributing-breakdown lines
("98% of your usage came from…") are deliberately excluded (not "N% used").

## Profile store

`profile.json` under `app.getPath("userData")` — the app's first global settings
file — via `profile-manager.ts`, mirroring `workspace-manager.ts` (read-with-
default, mkdir+write, zod-validated at the boundary). Holds `{ name, avatarDataUrl,
preferences }`. Avatar is an inline data: URL (no external fetch, CSP-safe, local).

## UI + wiring

`Profile.tsx` renders three sections (usage bars, identity, preferences) from
`ui.tsx` primitives + `vs-*` tokens. Usage bars color by proximity (accent < 70% <
warning < 90% < error) and expose the raw `/usage` text under "What's contributing?".

`App.tsx`: `View` gains `"profile"`; the "You" chip becomes an avatar button
(initial or image) → `onNavigate("profile")`; a `view === "profile"` branch renders
Profile (global, no active project needed). Profile loads once into App state so
the top bar and name-injection share it.

Name injection: the assistant is the conversational surface, so the name goes in at
`AssistantDock.submit()` as `appendSystemPrompt` — `useAgentRun.send()` spreads the
base opts, so it persists across every turn of the session. Guided-flow ops are
task prompts (not conversation), so they're intentionally left out.

Wizard pre-fill: `profileDefaults(profile)` maps preferences → `Partial<SetupAnswers>`
and is spread under `pendingSource`, so the design-source screen's choices still win.

## Invariants honored

The user's own Claude (usage via their CLI, `$0`, no proxy, no keys); local-first
(profile is a local file, avatar inline); no telemetry; arg-array spawn confined;
never `--bare`.
