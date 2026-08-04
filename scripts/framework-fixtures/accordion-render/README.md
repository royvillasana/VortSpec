# The real Accordion, rendered

PR #82 proved the **mechanism** on synthetic CSS. This proves the **specific component**.

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

**A3 is the part that is worse than a wrong colour.** `--color-neutral-100` is overridden in the dark theme, so the substituted token follows a palette ramp the component was never meant to follow. The defect is not one wrong value — it tracks the wrong scale, and diverges further wherever that scale differs.

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
