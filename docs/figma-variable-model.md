# How Figma models variables — and how VortSpec mirrors it

> Reference for the `figma-native-token-model` change. Explains the Figma
> Variables semantics (modes, groups, aliases) the token sync must mirror, and
> how VortSpec represents each on both sides of the sync.

## The five facts about Figma variables

1. **Collections define modes.** A `VariableCollection` is the container; every
   variable belongs to exactly one. The collection owns an ordered list of
   **modes** — each `{ modeId, name }` (e.g. `Light`/`Dark`, or
   `Desktop`/`Tablet`/`Mobile`). A new collection has one mode ("Mode 1");
   `collection.defaultModeId` names the fallback. VortSpec **reads** modes and
   maps them to code contexts — it never authors them.

2. **A variable stores one value per mode.** A `Variable` has a single
   `resolvedType` (`COLOR | FLOAT | STRING | BOOLEAN`) and a `valuesByMode` map:
   `modeId → value`. There is no single "the value" — only the value **in a
   mode**. (The pre-change cache stored one flattened value and reconciled
   "first mode wins", which mislabels drift.)

3. **A per-mode value is a raw value or an alias.** Each `valuesByMode` entry is
   either a concrete value or a `VariableAlias` `{ type: "VARIABLE_ALIAS", id }`
   pointing at another variable — the direct analog of code's `var(--x)`.

4. **Groups/folders are a naming convention, not objects.** A variable named
   `primitive/color/primary` simply *renders* nested under `primitive` → `color`
   with the leaf label `primary`. So: **group path = `name.split("/")` minus the
   last segment; leaf = last segment; indentation depth = path length − 1.**

5. **Code has no `/`.** CSS custom properties can't contain `/`; the universal
   convention is `/`↔`-` (`color/primary` ↔ `--color-primary`). VortSpec treats
   the Figma variable set as authoritative for path shape: a matched code token
   inherits its variable's slash path; a code-only token stays flat.

## How VortSpec mirrors it

| Figma concept | VortSpec representation |
|---|---|
| Collection + modes | `figmaCollectionSchema` (`name`, `modes`, `defaultModeId`) in the cache; surfaced as a **collection selector** + **mode switcher** in the Tokens panel |
| Value per mode | `FigmaVariable.valuesByMode` (keyed by mode **name** — stable + diffable); `InspectorToken.modes[modeName]` holds per-mode code value + drift |
| Alias | `FigmaModeValue.aliasOf` (target's slash name); preserved on push as `createVariableAlias` |
| Group path | `FigmaVariable.name` keeps the slash path; `InspectorToken.figmaPath` / `group` drive the indented folder tree |
| Mode ↔ code | `.vortspec/token-mode-map.json`: `{ figmaMode → CSS context }` (`:root`, `.dark`, `[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`), derived-then-overridable |

### Capture → reconcile → push

- **Capture** (`figma-cli.ts`): the primary path is a Variables plugin-API
  `eval` (`buildVariablesFetchScript`) that keeps every mode's value, the slash
  path, `resolvedType`, and aliases; it writes the object-shaped
  `.vortspec/figma-variables.json`. The DTCG export remains a single-mode
  fallback. `readFigmaVariableModel` parses both the new shape and the legacy
  flat array/map (wrapped as one `Default`-mode collection).
- **Reconcile** (`token-parser.ts` + `figma-reconcile.ts`): per **active mode**,
  matched on the group-qualified name, comparing the code value in that mode's
  mapped context to the variable's value in the matching Figma mode. A mode with
  no mapped context is shown **read-only**, never "drifted".
- **Push** (`figma-push.ts` + `buildPushScript`): writes into the mapped mode via
  `setValueForMode`, names created variables with their full slash path (folders
  preserved), and re-creates `var(--x)` as an alias per mode when the target's
  type matches.

### Non-goals

VortSpec does not author Figma mode/collection structure, does not invent a code
context that isn't in the token file (unmapped modes stay read-only), and never
talks to Figma directly — capture and push are delegated to figma-cli or a scoped
Claude Code run using the user's own Figma access.
