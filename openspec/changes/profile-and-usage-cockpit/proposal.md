# Profile & usage cockpit

## Why

Users need to know how much of their Claude plan they've used — the same
percentage bars Claude Code shows in `/usage` — without leaving VortSpec and
without VortSpec proxying anything or storing credentials. They also want one
place (the top-right avatar) to set an identity the assistant can address them by,
and to see/configure the intake defaults for new projects.

The invariant is "the user's own Claude." The key discovery that makes this
possible cleanly: **`claude -p "/usage" --output-format json` returns the exact
usage percentages Claude shows, as a local command — no model call, `$0`, the
user's own login, nothing proxied.** So we can mirror Claude's own numbers
faithfully instead of fabricating limits.

## What Changes

- **Profile page behind the top-right avatar.** The placeholder "You" chip becomes
  a real avatar button that opens a global Profile view (not project-scoped).
- **Plan usage, mirrored from Claude.** A usage reader runs the user's own
  `claude -p "/usage"`, parses the percentage bars (session, weekly, per-model)
  and reset times, and renders them as filling bars — colored by proximity to the
  limit — with Claude's own "approximate, this machine only" disclaimer and a
  details view of the raw output. Failures degrade to a fix-it message.
- **Identity.** A display name and optional avatar image (stored locally as a data
  URL). The name is injected via `appendSystemPrompt` into the assistant chat so
  Claude addresses the user by name for the whole session.
- **Intake defaults.** Default framework / language / styling / test-runner /
  Figma token-collection, viewable and editable in Profile, that pre-fill the
  setup wizard for new projects (each project still keeps its own config).
- **Global settings store.** A new `profile.json` under Electron `userData` — the
  app's first app-wide settings file — with `profile:get` / `profile:save` IPC.

## Impact

- New: `shared/usage.ts`, `shared/profile.ts`; `main/usage/usage-reader.ts` +
  `usage-parser.ts`; `main/settings/profile-manager.ts`; `renderer/views/Profile.tsx`.
- Changed: `App.tsx` (View union + `profile` state + Profile branch + avatar
  button + wizard pre-fill), `AssistantDock.tsx` (`userName` → `appendSystemPrompt`),
  IPC contract/handlers/preload/mock.
- Invariants honored: the user's own Claude (usage read via their CLI, `$0`, no
  proxy, no keys), local-first (profile is a local file), no telemetry.
