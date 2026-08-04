# Browser fixture — what runs, and what runs it

`npm ci && npx playwright install chromium && npm run verify`

**NOT WIRED INTO CI.** The only workflow in this repo (`pages.yml`) does not touch
`scripts/framework-fixtures`, and nothing provisions Playwright's Chromium. This runs by hand.
Stated here rather than implied, because a fixture nobody runs is evidence that decays silently.

Pinned exactly: `@web/test-runner 0.18.3 · @web/test-runner-playwright 0.11.0 · playwright 1.48.2`.

## Cases

| id | measures |
|---|---|
| B0 | as-designed renders `rgb(206, 228, 233)` — the case that must come back EQUAL |
| B1 | as-built renders `rgb(248, 249, 250)` — the defect, painted |
| B2 | the two render DIFFERENTLY while both are valid `var()` — load-bearing |
| B3 | `var(--never-defined)` paints transparent **and** emits no `console.error` / `window.onerror` |

## Scope

Synthetic CSS reproducing two measured values. It proves the MECHANISM — a syntactically valid
`var()` bound to the wrong variable renders a different colour, and an undefined one renders
nothing while reporting nothing. It does **not** prove anything about the live Accordion; that is
a separate artifact.

## Mutation results (run by hand, from this directory)

    point as-built at the correct token       2 of 4 fail   B1 B2
    bg() always returns the Figma spec        3 of 4 fail   B1 B2 B3
    bg() always returns the wrong global      3 of 4 fail   B0 B2 B3
    emit one console.error during B3          1 of 4 fail   B3        <- proves the silence assertion fires
    restored                                  4 pass

B2 is the load-bearing case, catching every mutant. B0 catches one that B2 and B3 also catch —
recorded because the PR originally predicted the opposite and the mutants refuted it.

There is no committed mutation driver; the rows above were applied by hand. That is a real gap
compared with the Vue fixture's `mutate.mjs`, and it is named rather than left to be assumed.
