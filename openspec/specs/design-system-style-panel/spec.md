# design-system-style-panel Specification

## Purpose
TBD - created by archiving change design-system-style-panel. Update Purpose after archive.
## Requirements
### Requirement: A Library tab presents the design system independently of the selection
The Playground sidebar's detail region SHALL offer a **Library** tab beside **Design Attributes**. Library
SHALL present the project's design system as a whole and SHALL be usable with nothing selected; changing the
selection SHALL NOT change what Library shows. The active tab SHALL persist per project.

#### Scenario: Library needs no selection
- **WHEN** the user opens the Library tab with no element selected
- **THEN** the design system is shown and editable

#### Scenario: Selection does not disturb Library
- **WHEN** the user selects a different layer while Library is open
- **THEN** Library continues to show the project-wide design system, and Design Attributes reflects the new selection when the user returns to it

### Requirement: Library has a Manual mode of five style sections
Library's Manual mode SHALL present exactly five sections: **colors**, **typography**, **spacing**,
**borders**, and **shadows**. Each section SHALL show the design system's values for that property, and each
value SHALL be editable in place.

#### Scenario: The five sections are present
- **WHEN** the user opens Library in Manual mode
- **THEN** the colors, typography, spacing, borders and shadows sections are shown, each populated from the project's design system

#### Scenario: Editing a value in a section
- **WHEN** the user changes a value in any section
- **THEN** the design system takes the new value and the change is recorded in the durable overlay, leaving a consumed library's real files unmodified

### Requirement: A section's rows follow the project's own tokens
A section's rows SHALL be the project's OWN tokens whose type belongs to that section, in the project's own
naming — not a fixed list of roles VortSpec defines. Every such token SHALL be present and editable, so no
token is unreachable because VortSpec has no name for it.

#### Scenario: A project's whole radius scale is editable
- **WHEN** a project defines four radius tokens under its own names
- **THEN** all four appear as rows in the borders section and each is editable

#### Scenario: Rows reflect this project, not a template
- **WHEN** two projects name their colour tokens differently
- **THEN** each project's section shows its own tokens, and neither is shown a row for a token it does not have

### Requirement: A live preview reflects the current values
Library SHALL show a preview rendered from the design system's CURRENT values, so the user can judge the
values together without opening a screen. The preview SHALL update when a value changes.

#### Scenario: The preview follows an edit
- **WHEN** the user changes a color or radius in Manual mode
- **THEN** the preview re-renders with the new value

### Requirement: Presets are named bundles of design-system values
Library SHALL offer a **Presets** mode listing presets with exactly one marked active, and SHALL let the user
apply one, create one from the current values, and import one. Applying SHALL write the preset's values
through the durable overlay. A preset SHALL be stored against ROLES rather than raw token names, so it stays
applicable to a project whose tokens are named differently. Before applying, VortSpec SHALL show what the
apply will change — which tokens take a new value, which are newly introduced, and which roles will be
skipped — because one action rewrites many tokens at once.

#### Scenario: Applying a preset
- **WHEN** the user applies a preset
- **THEN** the design system takes that preset's values, the preset is marked active, and the screens re-render

#### Scenario: The apply is previewed
- **WHEN** the user chooses to apply a preset
- **THEN** the tokens that will change, the ones that will be introduced, and the roles that will be skipped are shown before anything is written

#### Scenario: A preset the project cannot fully express
- **WHEN** an applied preset carries a role this project has no token for and cannot introduce
- **THEN** the roles that resolved are applied and the skipped ones are reported, rather than silently dropped or guessed

#### Scenario: Creating a preset from the current values
- **WHEN** the user creates a new preset
- **THEN** the design system's current values are captured under the given name and appear in the list

### Requirement: Default is the source design system, not a preset
The list SHALL always offer **Default**, which is NOT a stored preset but the design system the project
already has from its SOURCE — a consumed library's own values, or the design system in the connected Figma
file. No values are authored or stored for Default. Selecting it SHALL put the source's design system back
in effect by removing what a preset contributed, while PRESERVING the user's own edits. VortSpec SHALL
additionally ship fixed built-in presets; applying one and then editing SHALL change the PROJECT only,
leaving that built-in's definition unaffected and still available to re-apply.

#### Scenario: Default shows the library's own design system
- **WHEN** the user selects Default on a project that consumes a component library
- **THEN** that library's own design-system values are shown and in effect

#### Scenario: Default shows the Figma file's design system
- **WHEN** the user selects Default on a project whose source is a Figma file
- **THEN** that file's design system is shown and in effect

#### Scenario: Returning to Default undoes the preset, not the user's own work
- **WHEN** the user applies a built-in preset, makes their own edits, and then selects Default
- **THEN** the preset's contribution is removed and the user's own edits remain in effect

#### Scenario: Editing changes what the project has
- **WHEN** the user changes a value in Manual mode
- **THEN** the project's design system takes that value, and no preset is modified

#### Scenario: Editing after applying a built-in does not change the built-in
- **WHEN** the user applies a built-in preset and then changes one of its values
- **THEN** the project takes the new value and the built-in preset is unchanged, still offering its original values if re-applied

### Requirement: The font family is chosen from the project's available sources
The typography section SHALL let the user choose a font family from a picker rather than type a name, and
that picker SHALL offer families from: the project's own font tokens, the fonts installed on the system, the
fonts used by the connected Figma file, and the Google Fonts catalog. Each family SHALL be labelled with the
source it came from. A chosen family SHALL actually be loaded wherever the design system renders — the
panel's preview, the served screens, and generated code — and when it cannot be loaded VortSpec SHALL say
so rather than silently falling back.

#### Scenario: Choosing a Google font changes the type everywhere
- **WHEN** the user picks a Google Fonts family
- **THEN** the design system takes that family, and the preview and the served screens render in it

#### Scenario: Sources are distinguishable
- **WHEN** the user opens the font picker
- **THEN** each family is labelled with whether it comes from the project, the system, the Figma file, or Google Fonts

#### Scenario: A Figma family is marked as the design's font
- **WHEN** a family is offered because the connected Figma file uses it
- **THEN** it is explicitly marked as coming from the Figma library, since matching the design is why it is worth picking

#### Scenario: The catalog opens instantly and extends on demand
- **WHEN** the user opens the font picker with no network, and then scrolls or searches past the bundled families
- **THEN** the bundled set is available immediately, and the rest of the catalog is fetched only when the user looks past it

#### Scenario: A font that cannot be loaded is reported
- **WHEN** a chosen family cannot be resolved or fetched
- **THEN** the fallback keeps text readable and VortSpec states that the chosen family did not load, rather than leaving the user to wonder why the type is unchanged

### Requirement: A preset may introduce a role the project lacks
Applying a preset SHALL be able to INTRODUCE a design-system role the project has no token for — for example
a type scale on a project whose library defines none — by writing those values into the durable overlay. The
user SHALL be told which roles were introduced rather than merely changed. Introduced values SHALL be
ordinary overlay entries: editable afterwards like any other, and never written into a consumed library's
real files.

#### Scenario: A project with no type scale gains one
- **WHEN** the user applies a preset carrying a type scale to a project whose library defines none
- **THEN** those values are added to the project's design system, the user is told they were introduced, and they are editable afterwards in the typography section

### Requirement: The Library editor is offered on both surfaces from one implementation
The Library editor SHALL also be available in the Design-tokens workspace's sidebar, presenting the same
sections and the same actions as the Playground's Library tab, from a single implementation. An edit made on
one surface SHALL be reflected on the other rather than leaving it showing a stale value.

#### Scenario: The same editor on both surfaces
- **WHEN** the user opens the design-system editor from the Design-tokens workspace and from the Playground
- **THEN** both offer the same sections and the same actions

#### Scenario: Neither surface is stale after an edit elsewhere
- **WHEN** a value is changed on one surface while the other is also open
- **THEN** the other surface shows the new value rather than continuing to show — and allowing an edit from — the old one

