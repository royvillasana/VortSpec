# Capability: Inspector Assistant

## Purpose

AI-powered chat drawer for natural language design system commands with diff preview, approve/reject workflow, and optimistic concurrency control.

## Requirements

### Requirement: Chat drawer layout
The Assistant SHALL render as a slide-out drawer from the right side, approximately 400px wide, overlaying the main content. It SHALL contain a message history area and a text input at the bottom.

#### Scenario: Chat drawer opens and closes
- **WHEN** user clicks the chat icon in the chat strip
- **THEN** the Assistant drawer SHALL slide in from the right
- **AND** clicking the close button or chat icon again SHALL close the drawer

### Requirement: Natural language commands
Users SHALL be able to write commands in English or Spanish in the chat input. Commands SHALL support operations like: renaming tokens, merging tokens, setting values, deleting unused tokens, and batch modifications.

#### Scenario: User sends rename command
- **WHEN** user types "rename all color tokens to the semantic/primary/500 format"
- **THEN** the LLM SHALL process the command and respond with a proposed IRPatch

### Requirement: Patch diff preview
The LLM response SHALL render a proposed IRPatch as a visual diff: per-operation before/after values, affected entity counts, and a clear indication of what will change.

#### Scenario: Diff preview renders
- **WHEN** the LLM proposes a batch rename of 12 tokens
- **THEN** the chat SHALL display each rename operation with old name -> new name
- **AND** a summary SHALL show "12 tokens affected"

### Requirement: Approve or reject patches
Each proposed patch SHALL have "Approve" and "Reject" buttons. Approving SHALL apply the patch atomically. Rejecting SHALL discard it. Nothing SHALL mutate without explicit approval.

#### Scenario: User approves proposed patch
- **WHEN** user clicks "Approve" on a proposed patch
- **THEN** the patch SHALL be Zod-validated and applied atomically
- **AND** the IR version SHALL increment
- **AND** a confirmation message SHALL appear in the chat

#### Scenario: User rejects proposed patch
- **WHEN** user clicks "Reject" on a proposed patch
- **THEN** the patch SHALL be discarded with no mutation
- **AND** the LLM SHALL acknowledge the rejection

### Requirement: Ambiguity clarification
When a command is ambiguous, the LLM SHALL respond with a clarifying question rather than guessing at the intended operation.

#### Scenario: Ambiguous command prompts clarification
- **WHEN** user types "merge the greys"
- **THEN** the LLM SHALL ask which grey tokens to merge (listing candidates) rather than guessing

### Requirement: Optimistic concurrency
All patches SHALL include a `baseVersion` for optimistic concurrency. Stale patches (where `baseVersion` doesn't match current IR version) SHALL be rejected with a clear error.

#### Scenario: Stale patch rejected
- **WHEN** a patch with `baseVersion: 14` is applied but the current IR is at version 15
- **THEN** the patch SHALL be rejected with a message explaining the version mismatch

### Requirement: Chat message history
The chat SHALL maintain a scrollable message history showing the conversation between user and LLM, with messages styled differently for user (right-aligned) and assistant (left-aligned).

#### Scenario: Message history persists during session
- **WHEN** user sends multiple commands and receives responses
- **THEN** all messages SHALL be visible in the scrollable history
- **AND** user messages SHALL be right-aligned and assistant messages left-aligned
