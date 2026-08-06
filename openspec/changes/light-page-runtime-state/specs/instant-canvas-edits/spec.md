## ADDED Requirements

### Requirement: A light page saves what was edited, not what is displayed

Persisting a light page SHALL write the page's authored markup together with the edits made to it. A change to the live DOM that the canvas did not cause — made by the page's own scripts, or by interacting with a control the page renders — SHALL NOT be written to the file.

The distinction SHALL be drawn by where a change came from, never by which attribute or element it affects: an attribute a user changes through the canvas is an edit regardless of its name, and the same attribute changed by the page's own code is not.

#### Scenario: Interacting with the page does not edit it

- **WHEN** a control the page renders changes the DOM — a toggle setting `aria-pressed`, a carousel advancing a slide — and the page is then saved for an unrelated edit
- **THEN** the file contains the unrelated edit and none of those changes

#### Scenario: A deliberate edit to a state-like attribute is saved

- **WHEN** a user changes an attribute through the canvas that a page's script might also change, such as `aria-pressed`
- **THEN** it is written to the file, because it came from an edit

#### Scenario: Nodes a script created are not authored

- **WHEN** the page's own code inserts elements — cloned carousel slides, an injected tooltip — and the page is saved
- **THEN** those elements are absent from the file

#### Scenario: An unrelated edit produces only its own diff

- **WHEN** a user moves one element on a page that has running scripts
- **THEN** the resulting change to the file is that move and nothing else

#### Scenario: Repeated saves do not churn the file

- **WHEN** a page with a timed animation is saved twice with no edit in between
- **THEN** the file is unchanged the second time

### Requirement: Excluding a change never silently discards an edit

Because a discarded edit is invisible while an unwanted attribute is merely visible, every path by which the canvas edits a light page SHALL record its changes as authored, and that SHALL be verified per path rather than assumed.

#### Scenario: Every edit path persists

- **WHEN** any canvas edit is applied to a light page — style, text, class or variant, insert, delete, or move
- **THEN** it is present in the saved file

#### Scenario: A new edit path cannot quietly lose work

- **WHEN** an edit path exists that does not mark its changes as authored
- **THEN** the test suite fails rather than the edit being dropped at save time
