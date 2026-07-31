## ADDED Requirements

### Requirement: Consume-source readiness is a real check
For a consume source, readiness SHALL be determined by whether the library is actually consumable — the CLI ran and real source files exist (cli-registry), or the package resolves in the project and pointer entries exist (installed-package/headless) — and SHALL NOT be inferred from the count of detected components.

#### Scenario: Not ready until the library is consumed
- **WHEN** a library project has components hand-added to its roster but the library's CLI has not run / its package is not installed
- **THEN** readiness reports "not ready" and the consume/provision step is still required, rather than falsely reporting ready because the component count is greater than zero

#### Scenario: Ready once consumed
- **WHEN** the library's CLI has copied source (cli-registry) or its package resolves with pointer entries (installed-package)
- **THEN** readiness reports "ready" and the pipeline proceeds without a rebuild

### Requirement: Consume sources are excluded from automatic building
The automatic component build SHALL exclude every consume source (not only enterprise), so a consumed library's components are never swept into the from-scratch build cycle.

#### Scenario: Auto-build claims and stops for a consumed library
- **WHEN** the automatic build evaluates a consume-source library project
- **THEN** it claims the project and stops without building any component, preventing VortSpec-owned look-alikes that drift from the library
