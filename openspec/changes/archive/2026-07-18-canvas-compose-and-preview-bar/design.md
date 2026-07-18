## Context

`run-canvas-visual-editor` shipped the hard part: an Electron `<webview>` whose guest preload injects an inspector bridge into the running dev server, reading the already-rendered DOM with no cooperation from the user's project. It streams a node tree, computed styles, and geometry; the host draws an overlay, resolves elements to components and tokens, applies ephemeral CSS overrides, and commits through a gated Claude Code run with snapshot/revert. That change is implemented on `main` with all tasks complete, but **not archived** — its `run-canvas`, `preview-inspector-bridge`, and `visual-token-editing` capabilities live in `openspec/changes/`, not `openspec/specs/`.

That machinery is entirely *transformational*: every action takes an existing element and changes it. Nothing adds. And the surface has drifted — the controls live in the left sidebar, duplicated across two panels; the Playground (the same `RunApp` component, rendering the literal header "Playground") is mounted without `canvas`; and `canvasReady = canvas && isApp && !!embedUrl` (`RunApp.tsx:229`) hard-gates the canvas to the app dev server, so the Storybook-backed Playground could not have it even if the prop were passed.

**Prior art.** Impeccable ([impeccable.style](https://impeccable.style/), [ADR](https://github.com/pbakaus/impeccable/blob/main/docs/adr-live-variant-mode.md), [live.md](https://github.com/pbakaus/impeccable/blob/main/skill/reference/live.md)) implements this exact feature pair on an architecture nearly identical to ours: a local zero-dependency server plus the user's own Claude Code CLI editing the user's own files. Its Live Mode has an insertion-point picker, a resizable placeholder, and three generated variants cycled before acceptance. **Its Insert mode generates net-new HTML+CSS and does not consult a component library** — verified against source, not marketing. Our premise inverts that: we have a built, verified, tokenized roster in `.sdd-de/components.json`, so our options compose *the user's own components*. We are borrowing Impeccable's interaction geometry and its variant discipline, not its content model.

**Constraints.** Claude Code is the engine and authors all markup (invariant 1). Nothing commits without recorded approval (invariant 3). Child processes stay in the project folder with argument arrays (invariant 7). Everything is plain files in the user's project (invariant 6). `apps/desktop` has no `webviewTag` and routes preview to the legacy `DevPreview.tsx`, so this is `apps/ide` only.

## Goals / Non-Goals

**Goals:**

- Target the *space between* elements, not just elements, and show that space at its true size in real layout before filling it.
- Propose **up to three genuinely distinct** options per slot (fewer, with a reason, when the roster can't honestly support three), each composed from the project's own components, previewed in place with real framework behavior.
- Keep the methodology intact: an accepted insert tells the user its screen now owes an SDD-DE Screen Creation update, and a live preview scaffold cannot be committed.
- Collapse the Playground's canvas controls into one bottom toolbar that the canvas owns, so they stop hiding in a collapsible sidebar region and stop being duplicated across two panels.
- Make the current selection ambient, persistent context for the assistant instead of a one-shot right-click attachment.
- Keep every failure mode honest: refuse to guess an ambiguous slot, refuse to write a generated file, refuse to emit hand-written markup in place of a component.

**Non-Goals:**

- **Pan mode.** `RunCanvas.tsx:17` documents one; it has never existed. This change corrects the docstring and does not implement panning. (Zoom exists.)
- **`apps/desktop`.** Needs `webviewTag`, a guest-preload build target, and retiring `DevPreview.tsx`. Separate change.
- **The Storybook activity** (key `play`). Keeps its plain iframe; the `isApp` gate stays. See R1.
- **Precise element→source mapping.** No Babel plugin, no `data-source` attributes, no source maps. We stay heuristic and design the failure modes instead — see Decision 5.
- **Full-page or multi-slot generation.** One slot, one run.
- **Impeccable's annotation layer** (comment pins, freehand strokes read by shape). Genuinely good, but orthogonal; we already have a comment system to reconcile with first.
- **Replacing the existing token/variant editing flow.** Insert is additive alongside it.

## Decisions

### 1. Options are compositions of roster components, not generated markup

Each option is built from components in `.sdd-de/components.json` with variants/props chosen, grounded in the project's tokens and DESIGN.md. When nothing fits, the option surfaces "no component matches — extract a new one?" and routes into the existing extract-component flow.

*Why:* generating raw markup would manufacture precisely the hand-written-markup problem that the existing `assign component` / `extract component` actions exist to clean up (`RunApp.tsx:876-906`). The design system is the point of VortSpec; an insert flow that ignores it is a regression disguised as a feature.

*Alternatives:* **Impeccable parity** (net-new HTML+CSS) — faster to build, better at novel layouts, but ignores the roster and creates cleanup debt. **Library-first with net-new fallback** — flexible, but the fallback is the path of least resistance for the model, so in practice it quietly becomes the net-new option and the guarantee erodes. Rejected in favour of a hard "ask, don't improvise" boundary.

*Cost, stated plainly:* this is strictly harder than what Impeccable does. It needs the roster in the prompt, a result contract naming components used, and a validation step. It also fails more often — by design, because a visible "no component matches" is more useful than an invisible `<div>`.

### 2. Options are written into source under a snapshot, previewed via HMR, then accepted

Following Impeccable's central bet: variants go into the **source file**, delimited by markers, and the framework's own HMR renders them. Not DOM injection.

*Why:* DOM-injected previews lie. They lose framework state, they don't exercise the real component, and "accept" becomes a second, different code-generation step whose output may not match what was previewed. Writing to source makes accept trivial (delete the losers) and makes the preview the actual artifact.

*Why this does not breach invariant 3:* VortSpec already does exactly this. `RunApp.tsx:535-587` snapshots the component, lets a Claude Code run write to disk, reloads, and *then* offers Keep/Revert. The recorded approval is the Accept step, and the snapshot is the safety net. Options are a **transient preview scaffold**, marker-delimited and deterministically removable — the same category as the existing structural-edit preview, not a new one. This was the one place where copying Impeccable could have violated an invariant, so it is called out here rather than left to drift.

*Consequences that follow and are not optional:* the scaffold must be cleaned on cancel, on error, and on close (a crash leaving markers in a user's source file is the worst outcome this design can produce); the run must refuse generated/untracked files, because accepting into a generated file is silent data loss; and only one run may be in flight per workspace, because two runs writing options into one source region corrupt each other. Impeccable serializes for exactly this reason.

*Alternative:* ephemeral DOM injection via the existing `applyOverride` path — upholds the gate more literally and is cheaper, but previews something that is not the thing being accepted. Rejected.

### 3. Insert is a fourth mode; Interact is the resting state

`CanvasMode` gains `"insert"` alongside `inspect | interact | comment`. Modes stay mutually exclusive with `interact` as the default and resting state.

*Why not Impeccable's model:* Impeccable has independent Pick/Insert toggles where both-off *means* interact, with no Interact button — genuinely elegant, and I considered adopting it. Rejected because VortSpec already ships an explicit three-way toggle with `interact` as an equal, named, default member (`useInspectorBridge.ts:18`, `RunApp.tsx:301`), and users know it. Silently redefining Interact as an absence is a bigger change to the existing mental model than adding a fourth button.

### 4. One toolbar component, bottom-center

Extract a single `CanvasToolbar` and delete both existing copies — the one in `DesignPanel`'s Layers header (`DesignPanel.tsx:496-500`) and the independent re-implementation in `CommentsPanel` (`CommentsPanel.tsx:51-64`). The toolbar is owned by the canvas, not by a panel. (`canvasReady`'s `isApp` gate stays — see R1.)

*Why:* the controls are currently unreachable-adjacent (zoom disappears with the Layers region), duplicated (two implementations to keep in sync — the CommentsPanel copy exists only because that panel *replaces* the Design panel and would otherwise strand the user), and absent from half the surfaces that need them. A floating toolbar owned by the canvas is not styling; it removes the panel-swap coupling that forced the duplication. Bottom-center over the viewport, following Impeccable's global bar and the user's request.

*Naming collision, deliberately avoided:* there is an existing `ide-preview-bar` capability describing a bar at the bottom of the **editor group** with an App/Storybook selector and an Open Browser action, whose spec says the IDE "SHALL NOT embed the preview in an iframe." That is a **different surface** — a launcher for an external browser next to code — and this change does not touch it or contradict it. Ours is `canvas-toolbar`: input modes over an embedded canvas in the Run/Playground activities. Two bars, two jobs.

*Also:* the bridge-status indicator earns its place by making "the app is broken" distinguishable from "visual editing is unavailable," and by keeping Interact alive when the bridge dies so the app stays usable.

### 5. Slot→source stays heuristic, and escalates instead of guessing

Reuse the existing uid/fingerprint scheme in `guest.ts:74-89` (`uidOf` / `byId` / `fpToUid`) to identify the anchor, and the existing heuristic component resolution (`compose.ts:76-94`). Normalize every slot to *anchor + before|after*. When the anchor matches multiple source locations, hand the candidates and page context to the run for adjudication; when it matches none, stop with a human sentence.

*Why:* Impeccable — with far more invested in this — has no Babel plugin, no `data-source` attributes, and no source maps. It greps by id, then class, then tag+class, disambiguates by text content, and on ambiguity **refuses to guess**, exiting with `element_ambiguous` and candidates for the agent to adjudicate. That validates the bet we already made. The irreducible ambiguity rate is real; the answer is careful failure modes, not false precision.

*Normalization matters more than it looks:* "after A" and "before B" name one slot. Collapsing them at the boundary means the hit-tester, the placeholder, the prompt, and the source write all agree on one representation, and the ambiguity check has one thing to resolve.

*Text as disambiguator:* Impeccable's docs are emphatic — pass the element's leading text on every call, or a pick among sibling `<Card>`s silently lands on the first match. Our `Selection` already carries a label; the composition prompt must carry the anchor's text too.

### 6. Gap hit-testing follows Impeccable's geometry

Port the approach in [`insert-ui.mjs`](https://github.com/pbakaus/impeccable/blob/main/skill/scripts/live/insert-ui.mjs) into the guest: infer the axis from the *container's* computed style (flex `flex-direction`; grid `grid-auto-flow` then track count; else block); cluster siblings into **visual rows** by `rect.top` within a small threshold so wrapped flex rows work; require a **minimum cross-axis overlap** between a pair before offering the gap between them; apply a **slop** around the gap so pointing needn't be pixel-perfect; fall back to splitting the hovered element at its midpoint.

*Why each part earns its place:* clustering by geometry rather than DOM order is what makes wrapped rows behave; the overlap threshold is what stops the tool offering nonsense slots between elements that are merely DOM-adjacent; the slop is what makes it feel like a tool instead of a test of mouse precision. These are the three things that separate a working gap picker from a frustrating one, and they are cheap to port.

*Placeholder sizing:* prefer implicit sizing (`flex: 1 1 0`, `%`, `auto`) over pixels, specifically so an insert into a flex row doesn't inherit the parent's full width and blow up the layout. Size ships as a **soft hint**.

### 7. Ambient selection replaces the one-shot attachment, and the fake line range goes

Today: right-click → "Send to chat" → `onSendToChat(text, file)` → `setPendingRef({path, startLine: 1, endLine: 1, text, nonce})` (`App.tsx:538`) → an attachment of `kind: "selection"` → **cleared on submit** (`AssistantDock.tsx:370`). Replace with a live selection context chip that tracks the current selection, persists across turns, is detachable and inspectable, and never auto-runs.

*Why:* grounding that expires after one turn isn't grounding — the natural loop is "select this, now iterate on it," and today turn two silently loses the element. And the current path fabricates `startLine: 1, endLine: 1` to squeeze a canvas selection through the editor's file-range reference shape. A canvas selection has no honest line range; asserting one misleads the user reading the chip and the engine reading the prompt.

*Boundary:* attaching context must never start a run. Note the existing asymmetry to preserve — `dispatchAssistantTask` starts a fresh auto-running conversation; `onSendToChat` only attaches. Ambient selection belongs firmly on the *attach* side.

### 8. Distinctness is prompt discipline, and it is the actual product

Impeccable's [`live.md`](https://github.com/pbakaus/impeccable/blob/main/skill/reference/live.md) §4 devotes a mandatory four-phase procedure to making N variants *genuinely different*: extract the existing identity from real values before generating (banning aesthetic-family adjectives, which are "conclusions, not data"); default to preserving identity rather than departing (the cost asymmetry is explicit — three same-ish on-brand variants is recoverable, three off-brand ones is not); require each variant to differ along a *different axis*; then a squint test. There is even an anti-training-data guard against reflexively reaching for "Swiss-grid" or "Terminal."

*Why this is in the design doc:* their overlay is a delivery mechanism; that discipline is what makes three options worth showing. Three near-identical options are worse than one, because the user pays the cycling cost for no choice. Our axes differ from theirs — ours is *which components, which variants, what composition*, not free-form aesthetics — but the requirement to enumerate distinct axes before generating carries over directly. This must be a first-class part of the composition prompt, not an afterthought.

*Corollary:* the count is a default, not a law. Impeccable ships 3 with a configurable 1–8. We default to 3 and keep it adjustable.

### 9. Preload injection is our structural advantage over Impeccable — keep it

Impeccable must rewrite the user's entry HTML to inject its script and patch CSP with consent, then revert on exit. We own the webview and inject via `preload` (`RunCanvas.tsx:101-111`, `system:guestPreloadUrl` at `ipc.ts:119`).

*Why note it:* it is strictly better and it is free — we never touch the user's entry file and never negotiate CSP. When porting Impeccable's logic, resist importing the machinery that exists only to solve the injection problem we don't have.

## Risks / Trade-offs

- **Scaffold markers survive a crash and corrupt a user's source file** → The worst outcome here. Snapshot before any write; clean on cancel/error/close; make cleanup idempotent and marker-driven so a stale scaffold can always be swept. Prove it with a test that kills a run mid-write.
- **Two runs write options into one source region** → One in-flight composition run per workspace, enforced at the host, refused with a human message.
- **HMR destroys the placeholder / the anchor moves** → Re-acquire via the existing fingerprint scheme; on failure **dismiss with an explanation** rather than reattach to the wrong element. Impeccable's volume of resume/re-find code is a warning about true cost; budget for it.
- **Latency (~15–20s for three options, per Impeccable *after* heavy optimization)** → Progress reporting and cancellation are requirements, not polish. Impeccable ships *without* cancel and names it a known limitation; we should not repeat that.
- **Ambiguous anchors** → Escalate to adjudication or stop. Never write to an arbitrary candidate. Carry the anchor's text — this is the documented difference between landing on the right `<Card>` and the first one.
- **Sparse or missing roster** (`.sdd-de/components.json` absent → empty inventory, silently caught today at `component-reader.ts`) → Detect and say so with a next step; do not let an empty roster degrade into generated markup.
- **Deleting the CommentsPanel toggle strands comment-mode users** → The floating toolbar is owned by the canvas, not by whichever panel is mounted, which is what makes the duplication unnecessary in the first place. Verify comment mode explicitly.
- **Misreading the surface names again** → The keys are inverted from the labels (R1), and an earlier draft of this change built a whole section on that mistake. "Playground" = key `run` = the canvas that already exists. Storybook = key `play` = out of scope.
- **The commit guard reaches across a seam** (`gitCommit` in main must know about scaffold markers) → Keep it a file-derived marker scan, not plumbed renderer state, so it holds with no canvas mounted. It only guards VortSpec's own commit path; the terminal is not covered, so cleanup remains the real defence.
- **The post-accept Screen Creation notice becomes noise and gets ignored** → It must name the specific screen and offer to run the update, not just assert that one is owed. If it degrades into an unconditional banner, it will be trained away and the methodology guarantee becomes theatre.
- **`run-canvas-visual-editor` is unarchived**, so this change builds on capabilities that are not published specs → Sync or archive it first; this change is written to only ADD, so it validates standalone either way.

## Migration Plan

1. Sync/archive `run-canvas-visual-editor` so `run-canvas` / `preview-inspector-bridge` / `visual-token-editing` are published specs.
2. Land the toolbar behind the existing canvas feature flag: extract `CanvasToolbar`, delete both duplicates, keep modes/zoom behaviour identical. Purely structural — no new capability, easy to revert.
3. ~~Lift the `isApp` gate and wire the Playground.~~ **Cut** — the Playground already has the canvas (R1).
4. Ambient selection context — replaces the one-shot path; keep the right-click "Send to chat" entry point working during transition.
5. Insert mode geometry (guest side): axis inference, gap hit-testing, insertion line, placeholder + resize. No agent involvement yet; fully testable in isolation and shippable as a no-op picker.
6. Composition run: roster-grounded prompt, result contract, scaffold write/cleanup, option cycling, accept/discard. Last, behind its own flag, because it is the only step that writes to disk.

Rollback: each step is independently revertable; steps 5–6 sit behind a flag that falls back to today's three-mode canvas.

## Resolved Questions

These four were left open in the first draft and have since been decided by the product owner. Recorded here with their reasoning, because each one shaped a requirement.

### R1. The question was malformed — Storybook is out of scope, and section 3 is cut

**The question I asked conflated two different activities**, because the internal keys are inverted from their user-facing labels:

| key | UI label | renders | canvas today? |
|---|---|---|---|
| `run` | **Playground** | `RunApp kind="app"` | **yes** — canvas, 3 modes, selection→chat |
| `play` | **Storybook** | `RunApp kind="storybook"` | no — plain iframe |

I read the keys and concluded "the Playground is an inert iframe with none of this." That is false: the surface the user calls the Playground is key `run`, and it already has everything. Their original phrasing — "the three main buttons that we have *currently on the playground*" — was exactly right, and should have been trusted over the key-reading.

**Decided: Playground only. Storybook keeps its plain iframe. Section 3 is cut and the `isApp` gate stays.** The user's answer drew the real distinction — Storybook validates that a component exists and works; Playground insert asks which component fills a slot — and insert lands on the Playground regardless, which is where the canvas already is. Extending the canvas to Storybook was never requested; it would cost the gate lift plus validating the bridge against Storybook's per-story layout, for no asked-for benefit. A separate change if it's ever wanted.

*Lesson worth keeping:* in this codebase, "Playground" means key `run`. `RunApp` renders its own header as `{isApp ? "Playground" : "Storybook"}`, and the CT helper `openRun()` clicks a rail button named "Playground". Read labels, not keys.

### R2. Fewer than three options is a valid result; three is the ceiling

**Decided: 1–3, never padded, never more.** With a small roster, three *genuinely* distinct compositions may not exist. Returning two honest options beats three where the third is a near-duplicate — the user pays the cycling cost for no real choice. Three is a maximum, not a target.

*Consequence:* the result contract must carry a reason when it returns fewer, the UI must show that reason rather than an empty third slot, and the count control's range is 1–3 (not Impeccable's 1–8).

### R3. An accepted insert owes an SDD-DE Screen Creation **update**, and the user is told

**Decided: yes, it owes one — as an update to an already-created screen, surfaced after accept.** Inserting a filters row *is* screen composition, and `screen-creation-runtime` specifies that composing screens from built components runs the SDD-DE cycle, gated. Invariant 2 settles it: if the app and the CLI disagree, the CLI's methodology wins. The draft's "leaning lightweight" was wrong.

The shape matters. This is **not** a new screen and **not** a blocking gate in front of Accept. It is: accept the option, then **inform** the user that the screen's spec now needs a Screen Creation update to match what was just inserted, and offer to run it. Accept stays the commit point for the code; the spec update is the follow-through the user is told about and chooses when to run.

*Why not block Accept behind the spec update:* it would invert the loop the feature exists to make fast, and the user would abandon it. Informing preserves the methodology without making the visual flow hostage to it.

### R4. Committing mid-preview is blocked, not merely warned

**Decided: don't let the user commit while a preview scaffold is live; tell them first.** A marker-delimited scaffold in source is exactly the thing that must never reach a commit, and a warning that can be clicked through is how it eventually does.

*Where the block lives:* **in the main process, derived from the files themselves** — `gitCommit` scans the paths it is about to commit for scaffold markers and refuses if any are present. Not in renderer state.

*Why that and not a renderer guard:* the commit button lives in `SourceControl.tsx:314`, a different view from the canvas, so a renderer guard would need insert state plumbed across views — and it would still be defeated by a reload, a crash, or a second window. Deriving the answer from the marker on disk means the guard is correct even when no canvas is mounted, which is exactly the case where a stale scaffold is most likely. It also matches invariant 6: flow state is derivable from files on disk.

*Honest limit:* this guards VortSpec's own commit path. A user committing from the integrated terminal or an external client is not blocked, and cannot be. That's acceptable — the guard exists to stop the accident, not to enforce a policy against a determined user — but it means marker cleanup (task 6.14) stays the real defence, not this.
