# Tasks — Storybook sync & Google-format DESIGN.md

## 1. Additive Storybook (A)
- [x] 1.1 Rework `STORYBOOK_PROMPT` (DevPreview) to generate only-missing stories,
  never overwrite existing, re-runnable.
- [x] 1.2 Adapt the Playground action label (setup vs. "Sync stories") by hasStorybook.

## 2. Manifest format detection (validation surface)
- [x] 2.1 `shared/manifest.ts`: add optional `format: "google" | "decisions-log" | "empty"`.
- [x] 2.2 `manifest-reader.ts`: `detectFormat(content)` + set it in `getManifest`. Unit-tested.

## 3. DESIGN.md generation (B + C + D + integrate)
- [x] 3.1 Rework `GENERATE_PROMPT` (DesignManifest): relocate a decisions log to
  `.sdd-de/design-decisions.md`; run `/design-doc` reading it as context; spec-clean
  frontmatter; lint to 0 errors; reference all components + Storybook in prose.
- [x] 3.2 Redirect the app `sync` stage (`shared/flow.ts`) to `.sdd-de/design-decisions.md`.

## 4. Warn on wrong format
- [x] 4.1 DesignManifest: warning card + Regenerate when `format !== "google"`; a
  "Google format ✓" indicator when it is.

## 5. Tests + gate
- [x] 5.1 Unit: `detectFormat` (google / decisions-log / empty).
- [x] 5.2 CT: DesignManifest warns on a decisions-log manifest; no warning on google.
- [x] 5.3 `pnpm typecheck && pnpm test && pnpm test:ct && pnpm build && pnpm lint` green.

## 6. Ship
- [ ] 6.1 Bump version, build + sign + package universal dmg, release, verify site.
- [ ] 6.2 Manual E2E on `sdd based test`: Sync stories → 34 on Storybook; Generate →
  DESIGN.md is Google-format, lint-clean, references all components + Storybook.
