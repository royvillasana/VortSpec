# The `$extensions` payload contract for `.vortspec/tokens.json`

This document fixes the exact shape of the DTCG `$extensions` payload carried by VortSpec's
canonical token artifact, and states which fields are owned by this change
(`agentic-design-system`) and which are owned by `figma-native-token-model`.

It is task 7.1 and it gates every later unit in group 7: ingest (7.2), the read-time projection
(7.3), the DTCG validity assertion (7.4), every emitter (7.5–7.7), the non-design-tool ingest paths
(7.10), the light-manifest derivation (7.11), and the retirement of
`.vortspec/figma-variables.json` (7.13).

The TypeScript types and the Zod parse boundary for this contract live in
`packages/core/src/shared/design-tokens.ts`.

---

## 1. Why an extension at all

DTCG already models everything VortSpec needs from a design source **except one thing**: it has
group nesting, `$type`/`$value`, and alias references, but **no concept of modes** — and no concept
of the collections that own modes, nor of a design source's durable published identifier.

`design.md` (decision: *"The canonical token artifact is DTCG, and Figma's extra structure lives in
`$extensions`"*) resolves that gap by staying inside the format and using its own escape hatch
rather than inventing a VortSpec-native token shape. Consequently:

- The canonical artifact is **valid DTCG**. Any DTCG-aware tool can read it and will simply ignore
  the extension block.
- **No design-source-specific field appears outside `$extensions`.** No `collection`, no
  `valuesByMode`, no `resolvedType`, no Figma `key` at the top level of a token. That is the
  assertion task 7.4 tests.
- The extension is **additive**: dropping it entirely leaves a still-correct single-mode DTCG
  document whose values are the default mode's.

## 2. The namespace

```
com.vortspec.tokens
```

**Justification.** DTCG requires `$extensions` keys to be namespaced by reverse-domain notation so
two vendors' extensions cannot collide in one file. `vortspec.com` is this project's domain (it is
the only public origin the repo references), so `com.vortspec` is the correct vendor prefix. The
`.tokens` suffix scopes this payload to the token pipeline, leaving `com.vortspec.<other>` free for
future extensions on the same document without a schema migration.

The namespace is a single exported constant, `DTCG_EXTENSION_NS`, so it is never spelled twice.

Deliberately **not** `com.figma.*`: the payload is VortSpec's projection of a design source, not
Figma's own extension format, and the same shape is produced by the non-design-tool ingest paths
(CSS custom properties, a theme object, a consumed library's token file — task 7.10). Naming it
after Figma would make every non-Figma source a liar.

## 3. Placement

The payload appears in two places, with two different shapes:

| Where | Key | Payload |
|---|---|---|
| **Document root** | `$extensions["com.vortspec.tokens"]` | The collection registry + provenance (§4) |
| **Any token leaf** | `$extensions["com.vortspec.tokens"]` | That token's collection, modes and durable key (§5) |

Groups MAY carry an extension block; nothing in this change writes one, and readers MUST NOT
require it. Per-token values are never inherited from a group — a reader that wants a token's modes
reads that token's own block.

## 4. Document-level payload

```ts
{
  /** Which ingest path produced this artifact. Free-form so a new source needs no schema change. */
  source?: string;            // "figma" | "css" | "theme-object" | "library" | …
  /** ISO-8601 stamp of the read that produced it, for staleness reporting. */
  generatedAt?: string;
  /** The design source's collections, in source order. */
  collections: Array<{
    name: string;
    /** Mode NAMES, in the source's own order. Names — not ids — because they are human-diffable
        and stable across a re-export; ids are not. */
    modes: string[];
    /** The name of the collection's default mode. This is the mode whose value lands in `$value`. */
    defaultMode?: string;
  }>;
}
```

The registry exists so a reader can enumerate collections and modes **without walking every token**
— the Tokens panel's mode switcher and the per-mode emitters both need that list before they touch
a single token.

## 5. Token-level payload

```ts
{
  /** The collection this token belongs to, by name. Absent for a source with no collections. */
  collection?: string;
  /** The mode whose value is mirrored in the token's `$value`. Absent → single-mode. */
  defaultMode?: string;
  /** mode NAME → that mode's value. Absent for a genuinely single-mode token. */
  modes?: Record<string, {
    /** The concrete resolved value in this mode. Present whenever it is known — including when
        `alias` is set, so a consumer that cannot follow references still has something to emit. */
    value?: DtcgValue;
    /** Set when this mode's value is a REFERENCE rather than a literal. A DTCG alias string
        (`{primitive.color.primary}`) — never a Figma slash path. */
    alias?: string;
  }>;
  /** The design source's identity for this token. */
  figma?: {
    /** The publish-stable variable key — the durable join to a code token, surviving renames. */
    key?: string;
    /** The source's own scalar type (COLOR/FLOAT/STRING/BOOLEAN), when known. */
    resolvedType?: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
    /** The source's own variable name, recorded only when sanitising it changed it (rule 7). */
    sourceName?: string;
  };
}
```

### Rules

1. **`$value` mirrors the default mode.** For a multi-mode token, `$value` MUST equal
   `modes[defaultMode].alias ?? modes[defaultMode].value`. `$value` is never absent; the modes map
   is the *additional* structure, not the only one. This is what keeps the artifact readable by a
   mode-blind DTCG tool.
2. **References are DTCG aliases, everywhere.** A Figma variable name `primitive/color/primary`
   becomes the DTCG alias `{primitive.color.primary}` — in `$value` and in `modes[*].alias` alike.
   The slash→dot translation is owned here (§6); the *fact* that a per-mode value is a reference is
   owned by `figma-native-token-model`.
3. **A single-mode token MAY omit `modes` entirely.** It is then fully described by `$value`. A
   reader asking for "the value in mode X" falls back to `$value` when `modes` is absent — that is
   the legacy/flat-source path, and it must not be an error.
4. **The modes map is keyed by mode NAME.** Mode ids are Figma-internal, unstable across a file
   rebuild, and unreadable in a diff. The document-level registry preserves mode *order*, which the
   map (an object) cannot.
5. **Absent ≠ empty.** An absent `modes` means "single-mode"; an empty `modes` object is a bug and
   readers SHOULD treat it as absent rather than as "no values".
6. **Names are sanitised into DTCG's namespace.** DTCG forbids `.`, `{` and `}` inside a token
   *name*, because `.` is the path separator and `{`/`}` delimit an alias. Figma imposes no such
   rule and real files are full of `spacing/0.5`, `radius/1.5`, `gray.100`. Each `/`-separated
   source segment therefore has those three characters replaced with `-` before it becomes a group
   or token name — and the *same* translation produces every alias, so a reference always lands on
   the token the nesting actually spells. (Left alone, `spacing/0.5` would produce the alias
   `{spacing.0.5}`, which resolves to the three-segment path `spacing → 0 → 5` and dangles
   silently.) Whenever sanitising changed the name, ingest records the original under
   `figma.sourceName`, so the join back to the design source survives the rewrite. Rejecting a
   dotted name instead was considered and refused: it drops tokens a designer legitimately created.
   The implementation is `dtcgSegmentFromSourceName` / `figmaNameToDtcgPath` in
   `packages/core/src/shared/design-tokens.ts`.
7. **Nothing else goes in.** Anything the pipeline can *derive* — the flattened name, the CSS
   custom-property name, the emitted Tailwind scale key — is a read-time concern and MUST NOT be
   persisted here. The canonical artifact is not a cache of its own emitters.

### `$type` and the two scalars DTCG does not define

`$type` uses the DTCG-defined types (`color`, `dimension`, `fontFamily`, `fontWeight`, `duration`,
`cubicBezier`, `number`, plus the composites `strokeStyle`, `border`, `transition`, `shadow`,
`gradient`, `typography`). Figma additionally has `BOOLEAN` and `STRING` variables, which DTCG has
no type for; those are written as `$type: "boolean"` and `$type: "string"`. This is the one place
the artifact steps outside the DTCG type vocabulary, and it is recorded here deliberately rather
than hidden: the alternative — dropping boolean and string variables, or smuggling their type into
`$extensions` while leaving `$type` absent — loses information a round-trip needs. The precise
source type is *also* always available losslessly as `figma.resolvedType`, so a strict DTCG consumer
can ignore the two extra `$type` values without losing anything.

**The vocabulary is open, not closed.** An unrecognised `$type` is **preserved verbatim** and mapped
at read time by whichever consumer cares; it is never a parse failure. This is forced by task 7.2,
which persists the design source's own DTCG export *unmodified* — and real exports carry types
outside the list above (`fontSize`, `lineHeight`, `letterSpacing`, `boxShadow`; this repo's
`mapDtcgType` in `packages/core/src/main/figma/figma-cli.ts` already branches on all four). Since a
token document is parsed as a whole, a closed enum would let ONE unfamiliar leaf fail the entire
`safeParse`, and a failed parse is reported as "no canonical artifact yet" — so a single unknown type
would discard every valid token in the file. `isKnownDtcgType` is how a consumer asks whether a
`$type` is one it can switch on exhaustively. The cost is accepted knowingly: a typo (`"colour"`)
now round-trips rather than being rejected at the boundary, which is strictly better than losing the
document.

## 6. Ownership: what comes from `figma-native-token-model`, what is owned here

Per the merge rule in `design.md` (*"Resolving the overlap with `figma-native-token-model`"*): that
change owns the **semantics**, this change owns the **artifact and its emission**. Concretely, its
`valuesByMode` / `collection` / alias payload becomes the `$extensions` content of
`.vortspec/tokens.json` rather than the schema of a separate `figma-variables.json`.

| Field | Owner | Note |
|---|---|---|
| `collection` (a token's collection, by name) | `figma-native-token-model` | 1:1 with `figmaVariableSchema.collection` |
| `collections[]` registry (names, ordered modes, default mode) | `figma-native-token-model` | 1:1 with `figmaCollectionSchema`; mode **ids** are dropped here — see below |
| `defaultMode` (per token and per collection) | `figma-native-token-model` | that change's `defaultModeId`, resolved to a name |
| `modes[*].value` (per-mode concrete value) | `figma-native-token-model` | 1:1 with `figmaModeValueSchema.value` |
| The *fact* that a per-mode value is a reference | `figma-native-token-model` | its `aliasOf` |
| `figma.key` (publish-stable durable key) | `figma-native-token-model` | 1:1 with `figmaVariableSchema.key` |
| `figma.resolvedType` | `figma-native-token-model` | 1:1 with `figmaVariableTypeSchema` |
| The group path | `figma-native-token-model` (*semantics*) / here (*representation*) | that change keeps the slash path on a flat row; here the path **is** the nesting, so no `path` field exists |
| The namespace string `com.vortspec.tokens` | **here** | |
| The nesting of the above into a DTCG `$extensions` block | **here** | |
| Keying `modes` by name rather than by mode id | **here** | ids are Figma-internal and unstable; the registry carries order |
| DTCG alias syntax for references (`{a.b.c}`), and the slash→dot translation | **here** | that change records `aliasOf` as a Figma slash path |
| Sanitising `.`/`{`/`}` out of a name segment (rule 6), and `figma.sourceName` | **here** | DTCG's name restriction; that change's names are unconstrained |
| `$type` (including the `boolean`/`string` addendum and the open vocabulary) | **here** | mapped from `resolvedType` + name heuristics |
| The `$value`-mirrors-default-mode rule | **here** | |
| `source` / `generatedAt` provenance | **here** | not a Figma concept; also serves the non-design-tool sources |

**Fields deliberately NOT carried:** Figma mode **ids** (`figmaModeSchema.id`) and the flat
`resolvedValue` mirror. Ids are unstable and unreadable; `resolvedValue` is exactly `$value` and
duplicating it would create a second source of truth inside one file.

**Merge direction, both orders.** If `figma-native-token-model` lands first, its enriched
`figma-variables.json` stays and this change adds the canonical artifact alongside it, then migrates
readers and retires it (task 7.13). If this change lands first, that change targets `$extensions`
above instead of a new cache schema. Either way the end state is one canonical file.

## 7. Worked example

One colour token with Light and Dark modes, and one aliased semantic token. Abridged to the two
tokens plus the document block; a real artifact has the whole tree.

```json
{
  "$extensions": {
    "com.vortspec.tokens": {
      "source": "figma",
      "generatedAt": "2026-08-07T10:14:22.000Z",
      "collections": [
        { "name": "Primitives", "modes": ["Light", "Dark"], "defaultMode": "Light" },
        { "name": "Semantic",   "modes": ["Light", "Dark"], "defaultMode": "Light" }
      ]
    }
  },

  "primitive": {
    "color": {
      "primary": {
        "$type": "color",
        "$value": "#7C6FF0",
        "$description": "Brand purple.",
        "$extensions": {
          "com.vortspec.tokens": {
            "collection": "Primitives",
            "defaultMode": "Light",
            "modes": {
              "Light": { "value": "#7C6FF0" },
              "Dark":  { "value": "#9C93F5" }
            },
            "figma": {
              "key": "b1c9f0a3e4d5678901234567890abcdef1234567",
              "resolvedType": "COLOR"
            }
          }
        }
      }
    }
  },

  "semantic": {
    "color": {
      "action": {
        "$type": "color",
        "$value": "{primitive.color.primary}",
        "$extensions": {
          "com.vortspec.tokens": {
            "collection": "Semantic",
            "defaultMode": "Light",
            "modes": {
              "Light": { "alias": "{primitive.color.primary}", "value": "#7C6FF0" },
              "Dark":  { "alias": "{primitive.color.primary}", "value": "#9C93F5" }
            },
            "figma": {
              "key": "c2da01b4f5e6789012345678901bcdef23456789",
              "resolvedType": "COLOR"
            }
          }
        }
      }
    }
  }
}
```

Read it three ways to see the contract working:

- **A mode-blind DTCG tool** sees `primitive.color.primary = #7C6FF0` and
  `semantic.color.action → {primitive.color.primary}`. Correct, just Light-only.
- **A CSS-vars emitter with a `.dark` context** reads `modes` and writes `--primitive-color-primary`
  twice, once per context.
- **Reconcile** joins the code token to Figma on `figma.key`, compares against
  `modes[<active mode>].value`, and sees the alias so it can push a `var(--…)` back as an alias
  rather than a flattened literal.

## 8. What this contract does NOT do

It does not change ingest, emission, or any existing reader. This unit is the contract and its types
only.

*Since written:* tasks 7.2–7.4 landed the ingest, the read-time projection and the validator in
`packages/core/src/shared/canonical-tokens.ts`. `dtcgToVariables` is now a re-export of
`projectCanonicalToVariables` and flattens on READ; `.vortspec/figma-variables.json` is still written
alongside the canonical artifact, and is retired by task 7.13.
