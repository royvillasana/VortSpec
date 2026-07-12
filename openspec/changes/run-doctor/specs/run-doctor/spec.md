## ADDED Requirements

### Requirement: The Run view detects app failures

The Run view SHALL detect when the previewed app is failing and present a **Run Doctor** with the captured error. It SHALL trigger on (a) the dev server exiting non-zero, and (b) an **uncaught error or unhandled rejection** in the previewed app at runtime, reported by the Run-Canvas guest with its message, source location, and stack.

#### Scenario: Dev-server failure surfaces the Doctor

- **WHEN** the dev server exits with a non-zero code
- **THEN** the Run Doctor SHALL show with the captured stderr tail

#### Scenario: Runtime crash surfaces the Doctor

- **WHEN** the previewed app throws an uncaught error (e.g. a missing env var)
- **THEN** the guest SHALL report the error to the host and the Run Doctor SHALL show it with its source location

### Requirement: Deterministic quick-fixes are offered first

Before invoking Claude, the Run Doctor SHALL offer known, safe, one-click fixes when they apply: creating `.env` from an example, installing dependencies, and flagging **placeholder or empty required env vars** (values like `<...>` or blank) for the user to fill.

#### Scenario: Placeholder env var is flagged

- **WHEN** a `.env` contains a placeholder value (e.g. `https://<project-ref>...`) or a blank required var
- **THEN** the Run Doctor SHALL point out that the value must be filled in, rather than offering a code fix

### Requirement: One-click gated "Fix with Claude"

For failures without a deterministic fix, the Run Doctor SHALL offer a single **Fix with Claude** action that runs a gated Claude Code run over the project with the diagnostic context (the error, `package.json`, the failing file). The run SHALL take a revertable snapshot first and present **Keep / Revert** on completion. VortSpec SHALL NOT re-implement the fix itself, and the run SHALL be instructed to **not fabricate secrets** — for credential/env issues it identifies the required variables for the user to supply.

#### Scenario: Fix with Claude applies a revertable fix

- **WHEN** the user clicks "Fix with Claude"
- **THEN** a snapshot SHALL be taken, a gated Claude Code run SHALL diagnose and apply a minimal fix, and the user SHALL be offered Keep or Revert

#### Scenario: Nothing changes without the click

- **WHEN** the Run Doctor is shown but the user has not clicked Fix with Claude
- **THEN** no project file SHALL be modified

#### Scenario: Secrets are never fabricated

- **WHEN** the failure is a missing credential / env value
- **THEN** the run SHALL surface which variables are required for the user to fill, and SHALL NOT invent values
