## ADDED Requirements

### Requirement: One enforced component export convention

The methodology SHALL mandate a single component export convention (named exports for components), and component generation and `/storybook` story generation SHALL emit imports that match it, so a component and its stories/consumers never disagree on default-vs-named shape.

#### Scenario: Generated stories import the component the way it is exported

- **WHEN** a component is generated with a named export and its story is generated
- **THEN** the story imports it as a named import (not a default import), and Storybook builds without a `MISSING_EXPORT` error

### Requirement: Reconcile existing import/export mismatches

The system SHALL provide a reconciler that repairs single-specifier relative imports (in stories and in cross-component source files) to match each target module's actual exports, switching between named and default form as needed. It SHALL only act when the local name matches the target's export in the opposite form, and SHALL leave bare, namespace, and multi-name imports untouched.

#### Scenario: A default-imported named export is fixed

- **WHEN** `button.tsx` exports `Button` as a named export and `pagination.tsx` imports it as `import Button from "../atoms/button"`
- **THEN** the reconciler rewrites the import to `import { Button } from "../atoms/button"`

#### Scenario: A named-imported default export is fixed

- **WHEN** `icon.tsx` has `export default Icon` and its story imports `{ Icon }`
- **THEN** the reconciler rewrites the story to import `Icon` as a default import

#### Scenario: Ambiguous or unrelated imports are left alone

- **WHEN** an import is a namespace import, a multi-name import, or its local name is not an export of the target in either form
- **THEN** the reconciler leaves it unchanged rather than guessing

### Requirement: Reconciliation is verified by the compile gate

After reconciliation, the system SHALL run the compile/build gate (`tsc --noEmit` and/or `build-storybook`) and treat any remaining `MISSING_EXPORT` or type error as a blocking defect to fix before the Storybook/Playground step.

#### Scenario: A clean build follows reconciliation

- **WHEN** the reconciler has run over a project with mixed export conventions
- **THEN** `build-storybook` completes without `MISSING_EXPORT` errors
