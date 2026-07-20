## ADDED Requirements

### Requirement: Provision the styling pipeline before build and Storybook

For a project whose `styling` is `tailwind`, the system SHALL ensure the styling pipeline exists before the first component build and before the Storybook/Playground step: a Tailwind config, a PostCSS config, a `@tailwind` entry stylesheet, the Storybook preview importing that stylesheet, and the required build dependencies (`postcss`, `autoprefixer`). The step SHALL be idempotent and best-effort, and report what it created versus what already existed.

#### Scenario: A Tailwind project with no config is made buildable

- **WHEN** the styling foundation runs on a `styling: tailwind` project that has `tailwindcss` installed but no `tailwind.config`/`postcss.config`/`@tailwind` entry
- **THEN** it creates the config, postcss config, and entry stylesheet, ensures the Storybook preview imports the entry stylesheet, and ensures `postcss`/`autoprefixer` are installed

#### Scenario: Runs before the build/Storybook step

- **WHEN** the guided flow starts building components or provisioning Storybook
- **THEN** the styling foundation has already run, so components render with their utility CSS from the first render rather than as unstyled skeletons

### Requirement: Map design tokens into the Tailwind theme

The system SHALL provide a token → Tailwind theme bridge derived from the project's `tokens.css`, so design-token utility classes (e.g. `bg-brand-primary`, `text-default`, `text-body-regular-size`) resolve to their token variables. The bridge SHALL categorize tokens (colors, font size / line height / font family, spacing, radius, shadow) and stay in sync when tokens are re-extracted.

#### Scenario: Token utility classes resolve to their variables

- **WHEN** a component uses `bg-brand-primary` and the token `--color-brand-primary` (or `--brand-primary-*`) exists in `tokens.css`
- **THEN** the compiled CSS includes that class mapped to the token variable, and the component renders in the brand color

#### Scenario: Re-extracting tokens keeps the theme current

- **WHEN** tokens are re-extracted and `tokens.css` changes
- **THEN** the theme bridge reflects the new tokens without a manual edit to the Tailwind config

### Requirement: Never overwrite an existing styling config

The system SHALL NOT overwrite a Tailwind or PostCSS config that already exists; it SHALL only create missing pieces and only append the preview import when absent, reporting anything it left untouched.

#### Scenario: A hand-authored config is preserved

- **WHEN** the project already has a `tailwind.config` (authored by the user or the methodology)
- **THEN** the styling foundation leaves it unchanged and reports it as pre-existing

### Requirement: Degrade honestly when dependencies cannot be installed

The system SHALL detect the project's package manager to install the required styling dependencies; when it cannot determine or complete the install, it SHALL still write the configs and surface a one-line fix-it (the exact install command) rather than failing silently or guessing.

#### Scenario: Unknown package manager surfaces a fix-it

- **WHEN** no recognizable lockfile is present and the dependency install cannot run
- **THEN** the configs are written and the user is shown the exact `install postcss autoprefixer` command to run
