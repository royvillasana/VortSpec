## ADDED Requirements

### Requirement: The design-intelligence skills ship in the SDD-DE toolkit

VortSpec SHALL bundle its required design-intelligence Claude Code skills inside the SDD-DE toolkit (`@royvillasana/sdd-de`) under `ai-specs/skills/<id>/`, each a standard Claude Code skill (a `SKILL.md` plus any supporting files). The set SHALL include `ui-ux-pro-max`, `ai-ds-composer`, `ai-component-metadata`, `figma-component-generator`, `figma-variables-generator`, `codebase-index`, `problem-mapping`, and `crazy-8s`. These SHALL be treated as VortSpec-owned toolkit content, versioned and released with the toolkit.

#### Scenario: Skills are part of the toolkit package

- **WHEN** the toolkit is published
- **THEN** each bundled design skill directory SHALL be included in the package (covered by the package `files` allow-list) so it ships to consumers

#### Scenario: Only standard skills are bundled

- **WHEN** a candidate skill lacks a `SKILL.md` (e.g. an `.mdx`-format entry) or has no usable payload
- **THEN** it SHALL NOT be bundled as a toolkit skill

### Requirement: Skills are delivered into each project via the existing toolkit install

The bundled design skills SHALL be delivered into a project by the toolkit's existing install path — copied into `.sdd-de/ai-specs/skills/` and symlinked into the project's `.claude/skills/` — with no skill-specific code and no new install mechanism. Delivery SHALL iterate the skills directory dynamically so adding or removing a skill needs no code change.

#### Scenario: New project gets the skills

- **WHEN** a project is created with the toolkit
- **THEN** each bundled design skill SHALL be present in the project's `.claude/skills/` (via the standard copy + symlink)

#### Scenario: Existing project updates to the skills

- **WHEN** a project resyncs to a toolkit version that includes the design skills
- **THEN** the resync SHALL make them available in that project's `.claude/skills/` without manual steps

### Requirement: The user's global Claude config is not modified

Delivering the design skills SHALL be project-scoped. VortSpec SHALL NOT write the bundled skills into the user's global `~/.claude/skills/` or otherwise mutate the user's global Claude Code configuration as part of shipping these skills.

#### Scenario: Global config untouched

- **WHEN** the toolkit installs its skills into a project
- **THEN** the user's global `~/.claude/` SHALL be left unchanged

### Requirement: Marketplace plugins are out of scope for this delivery

Marketplace plugins the workflow also uses (e.g. `vercel`, the `figma` MCP) SHALL NOT be delivered as toolkit skills, since they are plugins rather than skill directories. Their detection/installation remains the responsibility of the base prerequisite-install flow.

#### Scenario: Plugins are not vendored as skills

- **WHEN** the toolkit ships its bundled skills
- **THEN** it SHALL NOT include marketplace plugins as skill directories; those remain handled by the prerequisite-install flow
