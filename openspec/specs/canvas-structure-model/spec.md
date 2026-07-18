# canvas-structure-model Specification

## Purpose
TBD - created by archiving change canvas-live-structural-editing. Update Purpose after archive.
## Requirements
### Requirement: The canvas recognizes the page's layout structure

The canvas SHALL build a structural model of a container subtree — its nested sections, rows, and columns, each with its flow axis and gap, and the normalized slots and drop zones between and around children. The model SHALL be pure (derived from a serialized snapshot of computed layout + child rectangles the guest produces), so it is testable without a live page, and it SHALL reuse the existing gap-geometry primitives rather than reimplement them.

#### Scenario: A nested layout resolves to a tree of rows and columns

- **WHEN** a container holds a section whose children are two rows, and one row holds three columns
- **THEN** the model SHALL represent that nesting (section → rows → columns), naming each node's axis and gap
- **AND** each container SHALL expose the normalized slots between its children (anchor + before/after)

#### Scenario: The slot under a point is resolved deepest-container-first

- **WHEN** a point sits in a gap that belongs to both an inner row and its outer section
- **THEN** the innermost valid slot SHALL be offered by default
- **AND** the model SHALL be able to resolve the parent container's slot on request (pop out one level)

#### Scenario: A dragged subtree is excluded from its own drop candidates

- **WHEN** resolving a drop slot while an element is being dragged
- **THEN** the dragged element's own subtree SHALL be excluded from the candidate children, so it cannot target a slot inside itself

### Requirement: The guest streams a structure snapshot on request

The guest SHALL, on request, serialize a container subtree into a snapshot — flat container descriptors carrying each container's stable fingerprint, rectangle, computed flow (display, direction/auto-flow, gap), and child ids, plus leaf rectangles — excluding the canvas's own overlay chrome. The snapshot SHALL ride the existing bridge protocol, zod-validated on receipt, and its emission SHALL be coalesced so a busy page cannot flood the host.

#### Scenario: The snapshot excludes canvas chrome

- **WHEN** the guest serializes a structure snapshot
- **THEN** elements marked as VortSpec overlay chrome SHALL NOT appear as containers or children in it

