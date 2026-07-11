# Tasks — Profile & usage cockpit

## 1. Usage reader
- [x] 1.1 `shared/usage.ts` (UsageResult/UsageLimit schemas).
- [x] 1.2 `main/usage/usage-parser.ts` — pure parser of `/usage` text. Unit-tested.
- [x] 1.3 `main/usage/usage-reader.ts` — spawn `claude -p /usage --output-format json`
  (arg-array, home cwd, 20s timeout), parse envelope, degrade to a fix-it error.

## 2. Profile store
- [x] 2.1 `shared/profile.ts` (Profile + preferences schemas).
- [x] 2.2 `main/settings/profile-manager.ts` — read/save `userData/profile.json`.
- [x] 2.3 IPC `usage:get`, `profile:get`, `profile:save` + handlers + preload + mock.

## 3. Profile view + entry point
- [x] 3.1 `views/Profile.tsx` — usage bars (colored, reset times, raw details),
  identity (name + avatar upload), preferences (intake defaults), save.
- [x] 3.2 `App.tsx` — View union `+profile`; avatar button (initial/image) →
  Profile; `view === "profile"` branch; load profile into App state.

## 4. Name injection + wizard pre-fill
- [x] 4.1 `AssistantDock` `userName` → `appendSystemPrompt` (persists across session).
- [x] 4.2 Profile preferences pre-fill the setup wizard (`profileDefaults`).

## 5. Tests + gate
- [x] 5.1 Unit: `usage-parser` (bars, reset strings, note, decimals, degrade).
- [x] 5.2 CT: Profile mirrors usage bars; fix-it on unavailable; edit+save name.
- [x] 5.3 `pnpm typecheck && pnpm test && pnpm test:ct && pnpm build && pnpm lint` green.

## 6. Ship
- [ ] 6.1 Bump version, build + sign + package universal dmg, release, verify site.
- [ ] 6.2 Manual E2E: open avatar → Profile shows real /usage bars; set name → the
  assistant addresses you by it; set defaults → new-project wizard is pre-filled.
