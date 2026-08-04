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

## Mutation results — `node mutate.mjs`, reproducible

    Mutant                                     exit  caught
    point as-built at the correct token        1     [B1 B2]
    bg() always returns the Figma spec         1     [B1 B2 B3]
    bg() always returns the wrong global       1     [B0 B2 B3]
    emit one console.error during B3           1     [B3]      <- the silence assertion fires
    CANONICAL (unmutated)                      0     []

Exit 0 overall; identical output across two consecutive runs.

B2 is the load-bearing case, catching every mutant. B0 catches one that B2 and B3 also catch —
recorded because the PR originally predicted the opposite and the mutants refuted it.

The four rows above were previously applied BY HAND and this file said so. Thor blocked on that
twice and was right both times: a disclosed unreproducible claim is still unreproducible. The
driver reproduces the hand-run table exactly, which is the first evidence that the hand run was
accurate rather than merely confident.

Two kinds of mutant on purpose. **Subject** mutants change the CSS — would the harness notice if
the bug were repaired? **Instrument** mutants replace `bg()` with a constant — is it reading the
browser at all? A fixture that only mutates its subject cannot catch a measurement that stopped
measuring.

WRONG v1: the driver's `caught` column anchored the case id at line start. @web/test-runner prints
`❌ <suite> > B1: <case>`, so it matched nothing and every row printed `caught: []` while the exit
codes were correct — a column that could never populate, inside the driver written to prove that
matchers fire. ACTUAL: the anchor is `> B1:`, taken from captured output rather than guessed twice.
