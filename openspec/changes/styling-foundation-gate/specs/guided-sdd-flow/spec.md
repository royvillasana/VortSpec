## ADDED Requirements

### Requirement: Styling foundation and compile gate run before Storybook/Playground

The guided flow SHALL provision the styling foundation before the first component build, and SHALL run the compile/build gate (`tsc --noEmit` and/or `build-storybook`) **before** presenting the Storybook/Playground step, so an unstyled pipeline or a broken build is surfaced and fixed before the user is shown a "ready" Storybook.

#### Scenario: Styling is provisioned before building

- **WHEN** the user starts building the roster in a `styling: tailwind` project
- **THEN** the flow has already ensured the styling pipeline exists, so the built components are styled rather than skeletons when Storybook opens

#### Scenario: A broken build blocks the Storybook step, not follows it

- **WHEN** components have `MISSING_EXPORT` mismatches or do not compile
- **THEN** the compile gate reports the failure before the Storybook/Playground step is offered, and the flow does not present Storybook as ready until it builds cleanly

### Requirement: Styling and export issues are surfaced as fix-it cards

The guided flow SHALL surface a styling-foundation or compile failure as a human, actionable fix-it (what is missing and the next step), consistent with the app's error convention, rather than a raw build error or a silent skeleton.

#### Scenario: Missing styling dependency is shown as a next step

- **WHEN** the styling foundation cannot install `postcss`/`autoprefixer`
- **THEN** the flow shows a fix-it card with the exact install command rather than letting Storybook render unstyled
