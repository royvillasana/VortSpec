# canvas-compose Specification

## Purpose
TBD - created by archiving change canvas-compose-and-preview-bar. Update Purpose after archive.
## Requirements
### Requirement: Insert mode picks the space between elements

In **Insert** mode the canvas SHALL let the user target the *gap between sibling elements*, not only an element itself. The bridge SHALL infer the flow axis from the container's own computed layout (flex direction, grid auto-flow/track count, otherwise block flow) and SHALL hit-test the gaps between adjacent siblings, tolerating imprecise pointing. When the pointer is not over a gap, the hovered element's own box SHALL be split at its midpoint along the flow axis to yield a before/after target. Every target SHALL be normalized to an **anchor element plus a `before`/`after` position**, so the two ways of naming one slot resolve identically.

#### Scenario: A gap between siblings is targetable

- **WHEN** Insert mode is active and the pointer is in the gap between two sibling elements
- **THEN** that gap SHALL be offered as an insertion target, normalized to the following sibling with position `before`

#### Scenario: Wrapped rows are grouped visually, not by DOM order

- **WHEN** siblings wrap onto multiple visual rows
- **THEN** gap targets SHALL be computed within each visual row, so a gap is offered only between siblings that are actually adjacent on screen

#### Scenario: Nonsense gaps are not offered

- **WHEN** two siblings are adjacent in the DOM but barely overlap on the cross axis
- **THEN** the space between them SHALL NOT be offered as an insertion target

#### Scenario: Imprecise pointing still hits the gap

- **WHEN** the pointer is close to, but not exactly inside, a gap
- **THEN** that gap SHALL still be targeted, within a tolerance

#### Scenario: Falling back to an element's midpoint

- **WHEN** the pointer is over an element and not within any gap
- **THEN** the target SHALL be `after` that element when the pointer is past its midpoint along the flow axis, and `before` it otherwise
- **AND** an `after` target SHALL be normalized to `before` the following sibling when one exists, so only a run's tail remains `after`

### Requirement: The insertion target is shown as a line along the flow axis

While Insert mode is active the canvas SHALL draw an **insertion line** (not a bounding box) at the current target, oriented across the flow axis, and SHALL signal the axis through the cursor. The line SHALL track the pointer as the target changes and SHALL be drawn only while Insert mode is active.

#### Scenario: The line shows where content will land

- **WHEN** an insertion target is under the pointer in a column flow
- **THEN** a horizontal insertion line SHALL be drawn at that target, spanning the target's width

#### Scenario: The axis is legible before clicking

- **WHEN** the current insertion target sits in a row flow
- **THEN** the line SHALL be vertical and the cursor SHALL indicate the horizontal axis

### Requirement: Clicking a slot materializes a resizable placeholder

Clicking an insertion target SHALL insert a **placeholder** that participates in the page's real layout, so the user sees the space they are about to fill at its true size in context. The placeholder SHALL be sized implicitly by default (filling its track in a flex/grid row rather than adopting a fixed pixel width) and SHALL be resizable by dragging its edges. Its resulting size SHALL be carried to the composition run as a **soft hint**, not a constraint. The placeholder SHALL be ephemeral: it SHALL exist only in the rendered page and SHALL NOT write to any project file.

#### Scenario: The placeholder occupies the real slot

- **WHEN** the user clicks an insertion target inside a flex row
- **THEN** a placeholder SHALL be inserted at that position, sized to participate in the row's layout rather than taking the parent's full width
- **AND** surrounding elements SHALL reflow around it as they would around real content

#### Scenario: Resizing expresses intent, not a constraint

- **WHEN** the user drags a placeholder edge to resize it
- **THEN** the placeholder SHALL resize live in the page
- **AND** its size SHALL be sent to the composition run as a hint the composition may deviate from

#### Scenario: The placeholder writes nothing

- **WHEN** a placeholder is created, resized, or dismissed
- **THEN** no project file SHALL be created or modified

#### Scenario: The placeholder survives a hot reload

- **WHEN** the dev server hot-reloads and replaces the DOM while a placeholder is active
- **THEN** the placeholder SHALL be re-established at the same slot by re-acquiring its anchor
- **AND** if the anchor can no longer be found, the placeholder SHALL be dismissed with a human explanation rather than reattached to the wrong element

### Requirement: Composition requires an expressed intent

A composition run SHALL NOT start from a placeholder alone. The user SHALL provide a prompt describing what belongs in the slot. Until an intent is expressed, the control that starts the run SHALL be disabled and SHALL explain what is missing.

#### Scenario: Empty prompt cannot generate

- **WHEN** a placeholder is active and no prompt has been entered
- **THEN** the generate control SHALL be disabled and SHALL state that a prompt is needed

#### Scenario: A prompt enables generation

- **WHEN** the user enters a prompt for the active placeholder
- **THEN** the generate control SHALL become enabled

### Requirement: Options are composed from the project's own components

The composition run SHALL be performed by Claude Code and SHALL be instructed to build each option out of **components already in the project's component roster**, choosing their variants and props, and grounded in the project's design tokens and its DESIGN.md hand-off. VortSpec SHALL NOT author markup itself. Each option SHALL declare which roster components it uses, so its provenance is inspectable before it is accepted.

#### Scenario: Options reuse the built design system

- **WHEN** the user prompts a slot and the project has a populated component roster
- **THEN** each returned option SHALL be a composition of roster components with chosen variants/props
- **AND** each option SHALL name the components it used

#### Scenario: Tokens and the hand-off ground the composition

- **WHEN** a composition run is started
- **THEN** the run SHALL be given the project's design tokens and DESIGN.md as grounding
- **AND** the options SHALL NOT introduce hardcoded hex or px values where a token exists

#### Scenario: No roster means no silent markup

- **WHEN** the project has no component roster
- **THEN** VortSpec SHALL say so with a next step rather than generating hand-written markup

### Requirement: A slot with no matching component offers extraction, not raw markup

When the run judges that no roster component fits the requested slot, that option SHALL be surfaced as an explicit **"no component matches"** result offering to extract a new reusable component, routing into the existing extract-component flow. VortSpec SHALL NOT silently emit hand-written markup in place of a component, because that reintroduces exactly what the extract-component action exists to remove.

#### Scenario: Missing component is surfaced, not papered over

- **WHEN** the composition run finds no roster component that fits the slot
- **THEN** the result SHALL state that no component matches and SHALL offer to extract a new one
- **AND** it SHALL NOT accept hand-written markup for that slot as a finished option

### Requirement: Up to three distinct options are proposed and exactly one is accepted

A composition run SHALL propose **at most three** options for the slot, and they SHALL be meaningfully distinct rather than variations of a single idea. When the component roster cannot honestly support three distinct compositions, the run SHALL return **fewer options with a stated reason** rather than padding the set with near-duplicates. The user SHALL be able to cycle the options and see each one rendered **in place in the real slot**. Exactly one option SHALL be accepted; accepting one SHALL discard the others.

#### Scenario: Up to three distinct options

- **WHEN** a composition run completes for a slot and the roster supports it
- **THEN** at most three options SHALL be proposed
- **AND** they SHALL differ in composition, not only in incidental values

#### Scenario: Fewer options are a valid result, not a failure

- **WHEN** the roster cannot support three genuinely distinct compositions for the slot
- **THEN** the run SHALL return only the options it can justify
- **AND** it SHALL state why there are fewer
- **AND** it SHALL NOT pad the set to three with near-duplicate compositions

#### Scenario: The count is never exceeded

- **WHEN** a composition run returns its options
- **THEN** there SHALL be no more than three

#### Scenario: Options preview in the real slot

- **WHEN** the user cycles to an option
- **THEN** that option SHALL be rendered in place in the target slot, in the running app, surrounded by real content

#### Scenario: Accepting one discards the rest

- **WHEN** the user accepts an option
- **THEN** that option SHALL remain in the project source
- **AND** every other option and all insert scaffolding SHALL be removed from the source

#### Scenario: Discarding restores the original

- **WHEN** the user discards without accepting an option
- **THEN** every option and all insert scaffolding SHALL be removed
- **AND** the project files SHALL be returned to their pre-run state

### Requirement: Options are written to source under a snapshot and gated by an explicit accept

To preview options in the running app with real framework behavior, the run SHALL write them into the project's source and let the dev server hot-reload. Before any option is written, VortSpec SHALL take a **snapshot** of the files it will touch. The written options SHALL be **delimited so they can be identified and removed deterministically**, and SHALL be a transient preview scaffold, never a finished artifact. Reaching a committed state SHALL require an explicit **Accept**; Discard SHALL restore the snapshot. VortSpec SHALL NOT leave scaffolding behind on cancel, on error, or on app close.

#### Scenario: A snapshot precedes any write

- **WHEN** a composition run is about to write options into source
- **THEN** a snapshot of the affected files SHALL be captured first

#### Scenario: Accept is the only path to a committed state

- **WHEN** options have been written and previewed but not accepted
- **THEN** the change SHALL NOT be treated as committed
- **AND** no scaffolding SHALL remain once the user accepts or discards

#### Scenario: Interrupted runs leave nothing behind

- **WHEN** a composition run fails, is cancelled, or the workspace is closed mid-run
- **THEN** the snapshot SHALL be restored so no option scaffolding survives in the project

#### Scenario: Generated files are refused

- **WHEN** the target slot resolves into a generated / git-ignored file (build output that is regenerated) rather than real source
- **THEN** VortSpec SHALL refuse to write and SHALL explain why, rather than making an edit that would be silently lost
- **AND** an untracked but non-ignored file (normal uncommitted source) SHALL NOT be refused on that basis alone

### Requirement: One composition run at a time, cancellable, with visible progress

Because options are written into the same source region, at most **one** composition run SHALL be in flight for a workspace at a time. The run SHALL report progress while it works and SHALL be cancellable; cancelling SHALL restore the snapshot.

#### Scenario: A second run is refused while one is in flight

- **WHEN** a composition run is in progress and the user starts another
- **THEN** the second SHALL be refused with a human explanation rather than writing concurrently into the same source

#### Scenario: Progress is visible

- **WHEN** a composition run is in flight
- **THEN** the UI SHALL show that it is working and how far along it is

#### Scenario: Cancelling reverts cleanly

- **WHEN** the user cancels a composition run in flight
- **THEN** the run SHALL stop and the snapshot SHALL be restored, leaving no scaffolding

### Requirement: An accepted insert tells the user its screen owes a Screen Creation update

Inserting a composition into a screen is screen composition, which the SDD-DE methodology specifies runs through the Screen Creation cycle. After an option is accepted, VortSpec SHALL inform the user that the affected screen's spec now needs a **Screen Creation update** — an update to an already-created screen, not a new screen — and SHALL offer to run it. The notice SHALL name the specific screen affected. Accepting SHALL remain the commit point for the code; the spec update SHALL NOT block Accept.

#### Scenario: Accept surfaces the owed update

- **WHEN** the user accepts a composed option into a screen
- **THEN** VortSpec SHALL inform the user that that screen's spec needs a Screen Creation update
- **AND** the notice SHALL name the affected screen and offer to run the update

#### Scenario: The update is an update, not a new screen

- **WHEN** the Screen Creation update is run for an accepted insert
- **THEN** it SHALL update the existing screen's spec to reflect the inserted composition
- **AND** it SHALL NOT create a new screen

#### Scenario: The owed update does not block accepting

- **WHEN** the user accepts an option and does not run the Screen Creation update
- **THEN** the accepted composition SHALL remain in the project source
- **AND** Accept SHALL NOT have been blocked or reverted by the outstanding update

### Requirement: A live preview scaffold cannot be committed

While a composition preview scaffold is present in project source, VortSpec SHALL **refuse** to commit through its own git surface, and SHALL tell the user that a preview is live and how to resolve it (accept or discard). The refusal SHALL be derived from the scaffold present in the files being committed, so that it holds even when no canvas is mounted — after a reload, a crash, or in a second window.

#### Scenario: Commit is refused while a preview is live

- **WHEN** the user commits through VortSpec and a composition scaffold is present in the files being committed
- **THEN** the commit SHALL be refused
- **AND** the user SHALL be told that a preview is live and that accepting or discarding it resolves the block

#### Scenario: The guard does not depend on the canvas being open

- **WHEN** a scaffold is present in source but no canvas is mounted
- **THEN** committing through VortSpec SHALL still be refused

#### Scenario: Resolving the preview unblocks committing

- **WHEN** the user accepts or discards the preview so no scaffold remains
- **THEN** committing through VortSpec SHALL proceed normally

### Requirement: Ambiguous slots are adjudicated, not guessed

Mapping the target slot to a location in source is heuristic. When the anchor cannot be resolved to a single unambiguous source location, VortSpec SHALL NOT pick one. It SHALL either hand the candidates to the run for adjudication with the surrounding page context, or report that it could not place the insertion and stop.

#### Scenario: Ambiguity is escalated

- **WHEN** the anchor matches more than one candidate location in source
- **THEN** VortSpec SHALL NOT write to an arbitrary candidate
- **AND** it SHALL either provide the candidates and page context for adjudication or stop with a human explanation

#### Scenario: Unresolvable anchors stop the run

- **WHEN** the anchor cannot be found in project source at all
- **THEN** the run SHALL stop with a human sentence and a next step, having written nothing

### Requirement: The user can override the inferred insert axis and choose a slot count

The compose dialog SHALL let the user explicitly choose whether the insertion is a **row** or a **column**, pre-set to the axis inferred from the container but overridable, and SHALL let the user choose how many **slots** to create. This layout slot-count SHALL be a distinct quantity from the number of AI options a run returns (1–3); the two SHALL NOT be conflated. The chosen axis and slot-count SHALL flow into both the placeholder geometry (which re-renders to match) and the composition prompt (which states the axis explicitly, overriding inference).

#### Scenario: Overriding the axis re-renders the placeholder and prompt

- **WHEN** the container infers a row but the user selects column
- **THEN** the placeholder SHALL re-render along the column axis
- **AND** the composition run's prompt SHALL instruct the composition to be inserted as a column

#### Scenario: Slot count is independent of option count

- **WHEN** the user sets a slot count
- **THEN** it SHALL change how many layout slots are created
- **AND** it SHALL NOT change how many AI options the run returns (still at most three)

### Requirement: The insert is a stepped layout-first flow

The compose dialog SHALL present the insert as two ordered steps: first a **layout** step where the user chooses the placement (into an existing gap, or a new row/column container) and how many rows/columns/slots, and only then a **compose** step where the chosen layout is shown as a fixed label (editable, returning to step 1) and the user describes or picks components to fill it. Discarding, cancelling, or erroring out of a build SHALL return the user to the layout step rather than stranding them on the compose step.

#### Scenario: Layout is chosen before composing

- **WHEN** the insert placeholder opens
- **THEN** the dialog SHALL show the layout step (placement + count) with no prompt input
- **AND** advancing to the compose step SHALL carry the chosen layout forward as an editable label

#### Scenario: Discarding a build returns to the layout step

- **WHEN** a generated build is discarded
- **THEN** the snapshot SHALL be restored
- **AND** the dialog SHALL return to the layout step for a fresh choice

### Requirement: A deferred screen-spec update surfaces in the Design sidebar

When an accepted insert owes a Screen Creation update and the user chooses **Later**, the owed update SHALL NOT be dropped; it SHALL surface as a persistent "Save changes" bar at the bottom of the Design sidebar (mirroring the inspect Apply bar) for the duration of the session, offering to run the update or dismiss it per screen.

#### Scenario: Later moves the owed update to the sidebar

- **WHEN** the user clicks Later on the accepted-insert screen-update notice
- **THEN** the notice SHALL clear
- **AND** a Save-changes bar naming the owed screen file SHALL appear at the bottom of the Design sidebar

#### Scenario: Saving from the sidebar runs the owed update

- **WHEN** the user clicks Save changes in the sidebar bar
- **THEN** the SDD-DE Screen Creation update SHALL run for each deferred screen
- **AND** the bar SHALL clear

