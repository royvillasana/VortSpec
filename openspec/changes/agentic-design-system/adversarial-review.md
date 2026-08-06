# Adversarial review — the `agentic-design-system` plan and the implementation it builds on

Method: the `/adversarial-review` discipline — *"is this actually implemented, or just assumed?"* —
applied to (A) the plan's own claims and (B) the existing code the plan depends on. Every finding
below was verified by reading the code, not inferred. Line references are on
`openspec/agentic-design-system` (branched from `main` @ `81a2108a`).

---

## Blockers

### B1 — Task 1.6 would ship broken code examples

`safePromptField` (`main/inspector/prompt-safe.ts:9`) strips `<` and `>`, collapses all whitespace
including newlines, and length-caps at 160 characters by default. Task 1.6 routes the **full**
metadata record through it, and the widened schema's `usage.commonPatterns[].code` is
copy-pasteable JSX.

`<Button variant="primary">Get Started</Button>` becomes `Button variant="primary" Get Started
/Button`, on one line, truncated at 160 characters. The single most useful field in the record —
runnable example code, which `component-metadata-model.md` explicitly requires to stay runnable —
arrives at the model destroyed.

The sanitizer is not wrong; it is correct for names and summaries, which is all it has ever
carried. The plan silently extended its remit to a payload it was never designed for.

**Fix:** code payloads need containment, not character stripping — fenced blocks with delimiter
escaping and a much larger cap, kept separate from the scalar-field sanitizer. Task 1.6 must
distinguish the two, and a test must assert a JSX example survives the round trip intact.

### B2 — Group 3's main deliverable would ship into dead code

Task 3.5 adds selection criteria to `buildLightPagePrompt` (`shared/light-page.ts:28`). That
function has **no caller**. Its only reference is the `lite:pagePrompt` IPC handler
(`main/lite/lite-source.ts:314`), exposed through `preload/index.ts:174` and `shared/api.ts:165`,
and nothing in `packages/ui` or `apps/ide/src` invokes it — on this branch *or* on
`openspec/live-playground` (checked with `git grep` against both refs).

Page creation actually runs through the assistant dock, whose contract is the
`LIGHT_FIRST_PAGE_DIRECTIVE` string constant (`ui/src/components/AssistantDock.tsx:42`), appended
via `buildRunOpts()` at line 399. **That builder does not set `groundWithIndex`.**

So the highest-volume, most user-visible AI surface in the product — "create a page" — runs with no
digest, no metadata, and no token map, and the plan as written improves a code path nobody executes.

**Fix:** task 3.5 must target the assistant run path, and group 3 needs a new task that sets
`groundWithIndex` on it. Either `buildLightPagePrompt` becomes the real contract behind that run,
or it is deleted — see M3.

### B3 — A spec requires CI that VortSpec cannot impose

`specs/design-system-index/spec.md` requires: *"CI fails on a stale index"*. VortSpec does not own
the user's project's CI and cannot add a check to it. The artifacts live under `.vortspec/` in the
**user's** project, and this repo neither tracks nor gitignores that directory because it is the
app, not a consumer of itself.

As written the requirement is unimplementable and would either be quietly dropped or force a
scope VortSpec has no authority over.

**Fix:** VortSpec's obligation is to *detect and report* staleness and to *offer* a check the user
can adopt. Rewrite the scenario against the surface VortSpec controls. The related design claim —
"committed so they are reviewable in a diff" — is a recommendation to users, not a property of the
system, and `design.md` should say so.

---

## High

### H1 — A record that fails validation is indistinguishable from a missing one

`readComponentMetadata` (`main/inspector/component-metadata.ts:32`) returns `null` both when the
file is absent and when `safeParse` fails. `metadataPlan` (line 76) treats `null` as missing and
puts that component into the regeneration prompt.

Widening the schema is exactly the event that makes existing records fail validation. The plan's
read-time migration covers *known* legacy shapes; anything else — a hand-edited record, a partial
write, a future schema bump — reads as absent and gets regenerated, **overwriting curated content
with no warning**. The design decided against a disk rewrite specifically to avoid manufacturing
false completeness; this path manufactures silent data loss instead.

**Fix:** three states, not two — present / unreadable / missing. Never auto-regenerate over
`unreadable`; surface it and require an explicit choice.

### H2 — Group 4's "strict superset" claim rests on a much weaker baseline than implied

`buildDesignAudit` (`main/inspector/design-audit.ts:56`) only flags a hex literal when
`colorByValue.get(v)` hits — that is, **only when the hardcoded value equals a token that already
exists**. A hex that matches nothing in the token file, which is the more serious violation, is
silently ignored. And `HEX_RE` (line 15) is hex-only: `rgb()`, `hsl()` and `oklch()` are invisible,
in a project whose own `better-colors` guidance pushes OKLCH.

Task 4.4 asserts intent findings are a superset of existing findings. That will pass trivially and
will read as validation while both blind spots survive into v2.

**Fix:** fix the v1 baseline inside group 4 — off-system values and non-hex color formats — before
claiming the superset property, or the assertion is theatre.

### H3 — The audit reads the file least likely to contain the violation

`design-audit.ts:51` reads `c.file` only. Under this project's own mandated structure — CVA
variants in a separate `.variants.ts` (`CLAUDE.md`, "CVA + cn() for all components") — the color
and spacing classes live in the **sibling**, which the audit never opens.

The capability already exists elsewhere: `component-reader.ts:210` has a `variantsSibling` helper,
and `token-parser.ts:244–249` already attributes token usage in `Button.variants.ts` to `Button`.
The audit is the one consumer that skips it. `variantsSibling` is currently module-private, which
is presumably why.

**Fix:** export it and audit both files. This is a pre-existing defect that groups 4 and 6 inherit —
governance v2 over the wrong file is worth nothing.

### H4 — Most generated metadata is currently a dead payload, and the plan never says so

`readMetadataFor` has exactly one consumer: `index-digest.ts:32`. That consumer reads **only**
`meta.summary` (line 49). `usage`, `patterns` and `antiPatterns` reach no model anywhere.
`readAllMetadata` (line 49 of `component-metadata.ts`) is exported and has no consumer at all.

So a gated, paid Claude Code run generates four fields, three of which are written to disk and
never read. The digest's line 42 tells the agent where the file is and then says "read a
component's file before composing with it" — ambiguous between the source file and the metadata
file, and in practice nothing compels either.

The plan fixes this, but never states it as the *current* condition. That matters for task 7.2: the
before/after benchmark will attribute to the new schema a gain that is partly just "the data is now
actually read."

**Fix:** state the baseline honestly in the plan, and measure "current metadata, now delivered"
as a separate step from "richer metadata" so the attribution is real.

### H5 — Coverage-by-construction never reaches existing components

Group 6 makes the scaffold write a record, and task 6.10 verifies coverage "for a project whose
components were all scaffolded". Every component that already exists — i.e. every real project —
is untouched. There is no backfill task anywhere in groups 1–7.

**Fix:** add a backfill task to group 1 (generate records for the existing roster) so group 6 is
about *keeping* coverage rather than *achieving* it.

---

## Medium

**M1 — The digest's overflow message instructs the exploration the digest exists to prevent.**
`index-digest.ts:52` and `:62` emit "(+N more — read the component dir)" and "read the token file".
On any system past the bound, the digest's own fallback is the anti-pattern. The `slice(0, 200)` is
also unranked — whatever order `component-reader` returned — so the dropped components may be the
important ones. After group 2, rank by `instanceCount`.

**M2 — `groundOptions` degrades silently.** `index-digest.ts:76-77`: a digest failure returns the
options unchanged and the run proceeds ungrounded with no signal to user or telemetry. A benchmark
run in task 2.10 could be silently ungrounded and record a false result.

**M3 — Two divergent copies of the light-page contract.** `buildLightPagePrompt`
(`shared/light-page.ts`, 60+ lines of rules: dual-key token discipline, `data-component` marking,
island scoping, WebGL perf caps, asset handling) and `LIGHT_FIRST_PAGE_DIRECTIVE`
(`AssistantDock.tsx:42`, a compressed re-statement). Only the second one runs. Drift between them
is invisible and untested.

**M4 — `MAX_FINDINGS` starves the more severe check.** `design-audit.ts:16` caps at 500, and drift
warnings are pushed before the hardcoded-color loop runs (lines 35–45 vs 48). A project with ≥500
drifted tokens produces zero hardcoded-color findings — the `error`-severity check — while the sort
at line 72 leads with warnings.

**M5 — Metadata reads are N sequential file opens, repeated.** `readMetadataFor` (line 41),
`metadataStatus` (line 60) and `metadataPlan` (line 75) each loop `await` per component, and
`metadataPlan` redoes `metadataStatus`'s work. At the 200-component bound that is 200 serial reads
per call. The widened schema makes each read larger.

---

## Low

**L1 — The flat-cost claim has no abort condition.** `design.md` adopts the published benchmark's
+3.5% as "the bar", but that number comes from an Astro portfolio with 57 components, measured by
someone else. Tasks 2.10 and 7.2 measure after the fact, and no threshold is defined at which the
design is declared wrong. Name the number that would stop the change.

---

## What this changes about the plan

Three edits are non-negotiable before implementation starts:

1. **Task 1.6** — split scalar sanitation from code-payload containment (B1).
2. **Group 3** — retarget from `buildLightPagePrompt` to the assistant run path, and add grounding
   to it (B2). Without this, groups 1–3 deliver nothing to the surface the user actually uses.
3. **`design-system-index` spec** — rewrite the CI scenario against what VortSpec controls (B3).

And three that should be folded in rather than discovered later: the unreadable-vs-missing state
(H1), fixing the v1 audit baseline and the `.variants.ts` blind spot inside group 4 (H2, H3), and a
backfill task (H5).

The strongest structural conclusion: **the plan was written against the code's stated design rather
than its call graph.** The grounding machinery exists and is good; it is wired to three run types,
none of which is page creation. Adding richer data to a pipeline that does not reach the user's main
surface would have produced a large, well-specified change with little observable effect.
