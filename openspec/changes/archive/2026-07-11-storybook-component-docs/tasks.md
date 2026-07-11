# Tasks — Rich per-component Storybook docs

## 1. App prompt + action
- [x] 1.1 Add `DOCS_PROMPT` (DevPreview): shared doc blocks + per-component `<Component>.mdx`
  matching the reference's 10 sections; Figma-enriched; additive/idempotent.
- [x] 1.2 `generateDocs()` + "Sync docs" button + `syncMode` overlay label.

## 2. Tests + gate
- [x] 2.1 CT: "Sync docs" button present in the Playground header.
- [x] 2.2 `pnpm typecheck && pnpm test && pnpm test:ct && pnpm build && pnpm lint` green.

## 3. Ship
- [ ] 3.1 Bump version, build + sign + package universal dmg, release, verify site.

## 4. Prove on `sdd based test`
- [ ] 4.1 Run "Sync docs" against the project; confirm shared doc blocks + `<Component>.mdx`
  pages are generated and match the reference sections (Card especially — same Figma file).
