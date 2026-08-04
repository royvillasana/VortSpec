# The real Accordion's class string and tokens, compiled and rendered

PR #82 proved the **mechanism** on synthetic CSS. This measures the **specific component's real
class string and real tokens, compiled by the real toolchain**.

**What it is not:** the mounted React component. What runs is a hand-written `<button>` carrying the
class string extracted from `accordion.variants.ts`, styled by CSS that TokenUpdate's own
`tailwindcss` CLI compiled from its own config and tokens. Thor was right that the earlier title
overstated it. That is strictly less than mounting the component and strictly more than a
reconstruction; the distinction is now in the name.

Every input is taken from the project rather than retyped:

| input | source |
|---|---|
| class string | `TokenUpdate/src/components/accordion/accordion.variants.ts` (extracted, recorded in `.real-open-classes.txt`) |
| tokens | `TokenUpdate/src/styles/tokens.css` |
| tailwind config | `TokenUpdate/tailwind.config.cjs`, compiled by **that project's own** `tailwindcss` CLI |

So the CSS under measurement is what that project's build actually produces. `getComputedStyle` in a real Chromium then resolves the cascade the way a screen does.

## Result

```
classes under test: bg-[var(--color-neutral-100)] text-[var(--color-brand-primary)]

A0-designed-matches-figma   as-designed  bg rgb(206,228,233)  fg rgb(7,109,130)   <- false polarity
A1-as-built      OBSERVED   as-built     bg rgb(248,249,250)  fg rgb(8,121,144)
A2-render-differently       248,249,250  vs  206,228,233      <- LOAD-BEARING
A2b-text-differs            8,121,144    vs  7,109,130
A3-dark-diverges-again      as-built in dark -> rgb(26,30,33)
```

**A2 is load-bearing, not A0.** Fizz's #82 mutants showed the equality case catches one mutant while the difference case catches all three; this fixture is built around difference for that reason. A0 still earns its place as the only assertion that must come back *equal* — without it an always-mismatch harness passes everything.

**A2b is a second, independent defect.** The text binding is a near-miss (`#087990` vs `#076D82`) that a glance would forgive. Both bindings are wrong; measuring them separately stops one being right by coincidence and covering for the other.

**A3 asserts the mechanism, not just a difference.** Thor's point: `dark.bg !== FIGMA_BG` only says
"the colour changed"; "tracks the wrong scale" is a stronger claim needing its own evidence. So the
substituted token is bound directly per theme and as-built must **equal it in both** while the two
differ from each other:

```
as-built light rgb(248,249,250) == --color-neutral-100 light rgb(248,249,250)
as-built dark  rgb(26,30,33)    == --color-neutral-100 dark  rgb(26,30,33)
ramp differs   true
```

That is what "follows the neutral ramp" means, stated as an assertion rather than a story.

## It refuses to run rather than passing vacuously

`built.css` is generated and gitignored, so the earlier version passed A2/A2b/A3 with the subject
entirely unstyled if you skipped the build — a harness reporting success without its subject
present, which is the defect this thread exists to remove.

```
built.css missing   REFUSING TO RUN, exit 2   (measured without a pipe; `| tail` reports tail's status)
built.css empty     REFUSING TO RUN, exit 2
classes stripped    2 failures  (canary + the ramp assertion)
```

`G1` asserts a compiled arbitrary class actually resolves; `G2` hashes the committed `tokens.css`
and `tailwind.config.cjs` against the source project and fails on drift — it caught a real one
immediately, because editing the copied config's `content` field broke byte-identity. Content is
now passed on the CLI (`--content ./page.html`) so the config stays identical to the source. When
the source project is absent the tie reports **SKIPPED**, never passes.

## Mutations

```
point as-built at the CORRECT token      3 of 4 fail   <- the defect repaired; difference cases go red
paint() always returns the Figma spec    3 of 4 fail
paint() always returns the as-built value 3 of 4 fail
restored                                 4 pass
```

## Running it

```bash
npm install
npx playwright install chromium
# compile the real CSS from the real project (adjust the path to your checkout):
"<TokenUpdate>/node_modules/.bin/tailwindcss" -c ./tailwind.config.cjs -i ./entry.css -o ./built.css
npm run verify
```

`built.css` is generated and gitignored — committing it would let the measured CSS drift from the config that produced it.

## Scope

One component, one project, light and dark. It does not claim anything about the other 68 roster entries; what it establishes is that this specific component, built by this project's real toolchain, paints a colour Figma does not specify.
