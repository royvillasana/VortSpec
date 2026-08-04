import { describe, it, expect } from "vitest";
import {
  addSourcePrompt,
  chunkByLevel,
  tierForChunk,
  buildChunkPrompt,
  buildOnePrompt,
  buildCustomizeLibraryPrompt,
  verifyPrompt,
  newComponentPrompt,
  newComponentFromFigmaNodePrompt,
  buildRemainingPrompt,
  RESCAN_PROMPT,
} from "./sdd-prompts";
import { componentTokenExtractionClause, componentTokenName } from "./component-tokens";
import { themeContractFor } from "./setup";

describe("buildCustomizeLibraryPrompt — apply the durable overlay via the library's lever (Phase 11)", () => {
  it("embeds MUI's theming + per-component lever and reads the durable overlay, not invented values", () => {
    const p = buildCustomizeLibraryPrompt("mui", themeContractFor("mui")!);
    expect(p).toContain(".vortspec/theme-overrides.json");
    expect(p).toContain(".vortspec/token-theme-keys.json");
    expect(p).toContain("createTheme"); // global theming approach
    expect(p).toContain("theme.components.Mui"); // per-component lever
    expect(p).toContain("PATCH"); // patch-in-place, not always regenerate
  });
});

describe("verifyPrompt — honest gate (no false PASS without a live render)", () => {
  it("blocks PASS and mandates BLOCKED when no preview URL is available", () => {
    const p = verifyPrompt("button", null, false);
    expect(p).toMatch(/MUST NOT report PASS/);
    expect(p).toMatch(/BLOCKED/);
    expect(p).toMatch(/Report PASS only if .* COMPILES\/BUILDS cleanly AND you ACTUALLY rendered/);
  });

  it("directs the agent to load and render the live surface when a preview URL exists", () => {
    const p = verifyPrompt("button", "http://localhost:5173", false);
    expect(p).toContain("http://localhost:5173");
    expect(p).toMatch(/render\/inspect it|not just the source/);
    // PASS remains gated on an actual render even with a URL.
    expect(p).toMatch(/Report PASS only if .* COMPILES\/BUILDS cleanly AND you ACTUALLY rendered/);
  });

  it("offers PASS / ISSUES / BLOCKED as the three verdicts", () => {
    expect(verifyPrompt("all", null, true)).toMatch(/PASS.*ISSUES.*BLOCKED/s);
  });

  it("keeps a compile/build check that blocks a false pass so broken code can't pass", () => {
    // Framework is explicit: an unset framework now BLOCKS rather than defaulting to tsc.
    const p = verifyPrompt("button", "http://localhost:5173", false, "react");
    expect(p).toMatch(/CODE \/ BUILD/);
    expect(p).toMatch(/tsc --noEmit/);
    expect(p).toMatch(/import type/); // names the exact class of bug that shipped before
    expect(p).toMatch(/does not compile is ISSUES/i);
  });

  // `tsc` cannot parse .vue/.svelte/.astro, so hardcoding it made Layer 3 pass without
  // checking the component — and a vacuous CODE green is what let Layer 1 report a visual
  // PASS on code that was never compiled.
  it.each([
    ["vue", /vue-tsc/],
    ["nuxt", /nuxi typecheck/],
    ["svelte", /svelte-check/],
    ["astro", /astro check/],
    ["angular", /ng build/],
  ])("gives %s a type-check that can read its files", (framework, expected) => {
    const p = verifyPrompt("button", "http://localhost:5173", false, framework);
    expect(p).toMatch(expected);
    // Anchored on the BARE invocation: `npx vue-tsc` legitimately contains "tsc --noEmit".
    expect(p).not.toMatch(/npx tsc/);
  });

  it("makes Angular READ strictTemplates and downgrade to PARTIAL when it is off", () => {
    // Bumble compiled the case: the same wrong binding compiles at exit 0 without the flag and
    // fails TS2322 with it. `ng build` runs and reports success, so this is a command that LIES
    // rather than one that cannot read the file — the vanilla branch below does not cover it.
    // Thor's requirement was behavior, not a caveat: a full pass on an unchecked binding is the
    // vacuous green this whole clause exists to remove.
    const p = verifyPrompt("button", "http://localhost:5173", false, "angular");
    expect(p).toMatch(/strictTemplates/);
    expect(p).toMatch(/PARTIAL/);
    expect(p).toMatch(/never a full pass/);
    // The words alone are not the contract — the FIRST version of this clause named a tsconfig
    // and treated a locally-absent flag as false, which downgrades a project whose coverage is
    // fine. Verified on @angular/compiler-cli 19.2.25 (inherit-control): a leaf that omits the
    // setting while its base sets it still fails the bad binding, and a leaf that overrides to
    // false still compiles clean. So the resolution has to be asserted, not the vocabulary.
    expect(p).toMatch(/angular\.json/);
    expect(p).toMatch(/architect\.build\.options\.tsConfig/);
    expect(p).toMatch(/extends/);
    expect(p).toMatch(/INHERIT/);
    expect(p).toMatch(/effective value/);
    expect(p).toMatch(/absent in the leaf is NOT false/);
    // Unresolvable must not read as coverage. Fail-closed, the same way the vanilla branch does.
    expect(p).toMatch(/cannot\s+resolve it, report CODE as PARTIAL/);
    // Both directions, because Bumble ran both: A4-* for the input half, A6-out-* for the output.
    expect(p).toMatch(/BOUND ACROSS a component boundary, in both directions/);
    expect(p).toMatch(/EventEmitter/);
    // Scoped to what A5-scope demonstrated — expressions ARE checked either way, so claiming
    // templates go unchecked would be the same over-reading the Svelte round cost us. The
    // profile must not even QUOTE that phrasing: this clause is read by a model, not a human.
    expect(p).not.toMatch(/templates are unchecked/);
  });

  it("does NOT gate Vue or Nuxt on strictTemplates", () => {
    // Reverted from a2771037, which added one. Three reasons, all evidence:
    //   1. Its `unchecked` text said an undeclared prop is "dropped at render". Rendered, it is
    //      NOT — `<Button :cout="7" />` emits `<button cout="7">42</button>`: the default is kept
    //      and the misspelling is FORWARDED to the root (Vue fallthrough attributes).
    //   2. `strictTemplates` cannot read intent. It rejects the typo (TS2561) AND legitimate
    //      `aria-label` / `data-testid` (TS2353); only class/style are exempt. Gating on it would
    //      mark a project PARTIAL for declining a flag that rejects its own a11y attributes.
    //      Angular's gap accepts a PROVABLY wrong binding with a free remedy; this is not that.
    //   3. The evidence is `vue-tsc`. Nuxt shares VUE_LIKE in this file, so the gate reached nuxt
    //      with no nuxt run behind it — shared profile code is not executable evidence.
    for (const framework of ["vue", "nuxt"]) {
      const p = verifyPrompt("button", "http://localhost:5173", false, framework);
      expect(p, `${framework} regained a coverage gate`).not.toMatch(/strictTemplates/);
      expect(p, `${framework} was told to report PARTIAL`).not.toMatch(/PARTIAL/);
      expect(p, `${framework} asserts the refuted drop-at-render mechanism`).not.toMatch(/dropped at render/);
    }
  });

  it("adds no coverage caveat to a framework whose check does not depend on config", () => {
    // The other polarity. Without this, a clause that fired for everything would still pass the
    // assertions above while making every framework's report read as degraded.
    for (const framework of ["react", "next", "vue", "nuxt", "svelte", "sveltekit", "astro"]) {
      const p = verifyPrompt("button", "http://localhost:5173", false, framework);
      expect(p, `${framework} inherited Angular's gate`).not.toMatch(/strictTemplates/);
      expect(p, `${framework} was told to report PARTIAL`).not.toMatch(/PARTIAL/);
    }
  });

  // Vanilla now has a real gate (`node --check`), but one that cannot cover HTML — so the
  // prompt must run it AND say what it did not cover, rather than implying full coverage.
  it("runs vanilla's real check and marks its coverage partial", () => {
    const p = verifyPrompt("button", "http://localhost:5173", false, "vanilla");
    expect(p).toMatch(/node --check/);
    expect(p).toMatch(/PARTIAL/);
    expect(p).toMatch(/JS syntax only/);
    expect(p).not.toMatch(/npx tsc/);
  });

  it("blocks CODE on an unknown framework rather than silently falling back to tsc", () => {
    const p = verifyPrompt("button", "http://localhost:5173", false, "brand-new-framework");
    expect(p).toMatch(/missing or unrecognized/);
    expect(p).toMatch(/CODE: blocked/);
    expect(p).not.toMatch(/framework-native type-check — '/);
  });

  it("blocks CODE when no framework is configured at all", () => {
    const p = verifyPrompt("button", "http://localhost:5173", false, undefined);
    expect(p).toMatch(/CODE: blocked/);
    expect(p).not.toMatch(/framework-native type-check — '/);
  });

  it("orders the gate visual → token → code, with visual as the primary check", () => {
    const p = verifyPrompt("alert", "http://localhost:6006", true);
    const visual = p.indexOf("Layer 1 — VISUAL");
    const token = p.indexOf("Layer 2 — TOKEN");
    const code = p.indexOf("Layer 3 — CODE");
    expect(visual).toBeGreaterThanOrEqual(0);
    expect(visual).toBeLessThan(token);
    expect(token).toBeLessThan(code);
    // A component that compiles + uses tokens but doesn't match its reference still fails.
    expect(p).toMatch(/does NOT match its reference FAILS this layer/);
    // Verify resolves the component's Figma node itself (no manual links) and compares to it.
    expect(p).toMatch(/RESOLVE each component's authoritative Figma reference YOURSELF — never ask me for a link/);
    expect(p).toMatch(/figmaNodeId.*componentKey/);
    expect(p).toMatch(/search_design_system/);
    expect(p).toMatch(/\/visual-verify/);
  });

  it("token layer flags hardcoded colors and checks the component's own semantic tokens", () => {
    const p = verifyPrompt("alert", "http://localhost:6006", true);
    expect(p).toMatch(/hardcoded hex\/rgb\/rgba\/px/);
    expect(p).toMatch(/--component-<name>-\*/);
    expect(p).toMatch(/is a TOKEN failure, even if it looks right/);
  });

  it("marks verified only on real evidence — no visual pass without a render-and-compare", () => {
    const p = verifyPrompt("alert", "http://localhost:6006", true);
    expect(p).toMatch(/never report a visual pass you did not render-and-compare/);
    expect(p).toMatch(/all three layers passing on real evidence/i);
  });
});

/**
 * Layer 1's checklist must come from the DESIGN, not from the implementation.
 *
 * WHAT THESE PROVE, EXACTLY: that the instruction is present and says the required thing. A prompt
 * assertion cannot prove an agent obeys it — only a live verify run against a component with a known
 * missing state can do that, and that run is the browser-runner work, not this. Claiming more from a
 * string match is the "check runs, reports green, proves nothing" shape these tests exist to remove,
 * so the limit is stated here rather than left to be assumed.
 *
 * The defect being closed is structural, not a lapse of care: `specs/accordion/visual-verify-report.md`
 * passed four state rows on a component missing two of the eight states Figma defines, because the
 * rows were enumerated from the code. A checklist built from the implementation has no row for a state
 * the implementation omits.
 */
describe("verifyPrompt — the variant checklist is derived from the design, not the code", () => {
  it("mandates enumerating the roster from Figma's variant properties before reading the code", () => {
    const p = verifyPrompt("accordion", "http://localhost:6006", true);
    expect(p).toMatch(/FROM THE REFERENCE, BEFORE you read the implementation/);
    expect(p).toMatch(/VARIANT PROPERTY DEFINITIONS/);
  });

  it("puts the roster rule inside Layer 1, the layer whose verdict it governs", () => {
    // Placement, which is checkable — NOT the agent's ordering, which is not. An earlier draft of
    // this test asserted indexOf(roster) < indexOf("Layer 2") and called that proof of the
    // before-you-read-the-code ordering. It is not: any position inside Layer 1 satisfies it, so
    // it would have passed for a clause that said the opposite. That is the same defect Thor caught
    // in V10 and Angular I4 — a measurement whose label claims more than it measures. The
    // before-reading ORDER is an instruction to the agent and only a live run can check it.
    const p = verifyPrompt("accordion", "http://localhost:6006", true);
    const roster = p.indexOf("FROM THE REFERENCE, BEFORE you read the implementation");
    expect(roster).toBeGreaterThan(p.indexOf("Layer 1 — VISUAL"));
    expect(roster).toBeLessThan(p.indexOf("Layer 2 — TOKEN"));
  });

  it("names deriving the checklist from the component's own props as the thing NOT to do", () => {
    // The discriminating half. Without this the prompt could say "enumerate the design's states"
    // and still leave the implementation an acceptable source, which is the status quo it replaces.
    const p = verifyPrompt("accordion", "http://localhost:6006", true);
    expect(p).toMatch(/Do NOT derive the checklist from the component's own props\/variants/);
    expect(p).toMatch(/cannot contain a row for a state the code omits/);
  });

  it("makes a designed-but-unimplemented state a FAILURE rather than an absent row", () => {
    const p = verifyPrompt("accordion", "http://localhost:6006", true);
    expect(p).toMatch(/is a Layer 1 FAILURE named as that state — never a row you silently drop/);
    expect(p).toMatch(/including rows the implementation has no code for/);
  });

  it("reports the roster per state, so a missing one is visible instead of absent", () => {
    // Honey's finding was a report that PASSED four rows while two designed states were unbuilt.
    // A per-state line with a `missing` value is what makes that reportable at all.
    const p = verifyPrompt("accordion", "http://localhost:6006", true);
    expect(p).toMatch(/STATE <name>: pass\|fail\|missing/);
    expect(p).toMatch(/any 'missing' forces\s+'?VISUAL: fail'?/);
  });

  it("BLOCKS rather than passes when the reference's variant set cannot be enumerated", () => {
    // Fail-closed, same shape as `profileFor`: coverage that could not be derived is unproven,
    // and unproven coverage must never be able to report PASS.
    const p = verifyPrompt("accordion", "http://localhost:6006", true);
    expect(p).toMatch(/If you cannot enumerate the reference's variant set.*Layer 1 BLOCKED/s);
    expect(p).toMatch(/never PASS a variant checklist you could not derive from the design/);
  });

  it("refuses an implementation-generated spec as the source when the design source is not Figma", () => {
    // The non-Figma polarity, and the subtler half: for these projects the spec is the nearest
    // thing to a design, but a spec GENERATED from the code carries the identical blind spot.
    const p = verifyPrompt("accordion", "http://localhost:6006", false);
    expect(p).toMatch(/enumerate the states the design source itself defines/);
    expect(p).toMatch(/generated FROM the implementation is not an independent source/);
    // ...and it must not send a non-Figma project to the Figma MCP for variant properties.
    expect(p).not.toMatch(/VARIANT PROPERTY DEFINITIONS/);
  });

  it("keeps the roster rule out of the source-only path's reach — it applies with or without a URL", () => {
    // The no-URL run is already BLOCKED for rendering, but the roster is derivable from the design
    // without a server. A missing state is exactly what a source-only audit CAN still report.
    const p = verifyPrompt("accordion", null, true);
    expect(p).toMatch(/FROM THE REFERENCE, BEFORE you read the implementation/);
    expect(p).toMatch(/STATE <name>: pass\|fail\|missing/);
  });
});

describe("design-anchored build — reproduce the Figma node, resolved autonomously", () => {
  it("buildOnePrompt anchors to the component's Figma node and forbids name-inference", () => {
    const p = buildOnePrompt("alert");
    // Resolve the node itself: recorded figmaNodeId/componentKey, else search_design_system.
    expect(p).toMatch(/never ask me for a Figma link/);
    expect(p).toMatch(/figmaNodeId.*componentKey/);
    expect(p).toMatch(/search_design_system/);
    expect(p).toMatch(/Do NOT infer the component's shape from its name/);
    expect(p).toMatch(/alert is\s+NOT a restyled button|NOT a restyled button/);
    // Use the component's own semantic tokens; never hardcode.
    expect(p).toMatch(/--component-<name>-\*/);
    expect(p).toMatch(/do NOT hardcode a hex\/rgba/);
    // No reference → don't fabricate.
    expect(p).toMatch(/build nothing and report it unreferenced/);
  });

  it("binds every Figma-bound value to a project token via the resolver, never a hardcode (7.1/7.2)", () => {
    const p = buildOnePrompt("accordion");
    expect(p).toMatch(/TOKEN BINDING/);
    expect(p).toMatch(/resolve that\s+variable to the project's OWN token and emit `var\(--<token>\)`/);
    // The layered resolver order, incl. value recovery for a renamed token.
    expect(p).toMatch(/link → exact name → resolved\s+VALUE → alias/);
    expect(p).toMatch(/NEVER emit a raw Figma variable name or a dangling `var\(--…\)`/);
    // On no match: dedup-checked create, never inline the literal.
    expect(p).toMatch(/isn't a\s+duplicate of a token that already has that value/);
    expect(p).toMatch(/never inline the literal/);
  });


  it("buildChunkPrompt carries the design reference for its components", () => {
    const p = buildChunkPrompt(["alert", "badge"]);
    expect(p).toMatch(/authoritative reference for a component is its own Figma/);
    expect(p).toMatch(/Use the extracted design tokens ONLY for/);
  });
});

describe("addSourcePrompt — re-run the Foundation against a new source", () => {
  const figma = { kind: "figma" as const, ref: "https://figma.com/file/abc" };
  const local = { kind: "local" as const, ref: "/tmp/components" };

  it("clean-sweep REPLACES the token set + rewrites the inventory", () => {
    const p = addSourcePrompt("clean-sweep", figma);
    expect(p).toMatch(/REPLACING the current one/);
    expect(p).toMatch(/replacing the existing token set/);
    expect(p).toMatch(/REWRITE `\.sdd-de\/components\.json`/);
    expect(p).toContain("https://figma.com/file/abc");
    // Clean-sweep is a replace — it must NOT instruct a merge.
    expect(p).not.toMatch(/MERGE/);
  });

  it("merge is additive and FLAGS same-name conflicts (never overwrites)", () => {
    const p = addSourcePrompt("merge", figma);
    expect(p).toMatch(/MERGE .* additive, never destructive/);
    expect(p).toMatch(/DO NOT overwrite — FLAG it as a conflict/);
    expect(p).toMatch(/deduped by name/);
    expect(p).toMatch(/FLAG the conflict/);
    expect(p).toMatch(/do NOT delete entries/);
  });

  it("names the source: Figma URL vs local path", () => {
    expect(addSourcePrompt("merge", figma)).toMatch(/Figma file at https:\/\/figma\.com\/file\/abc/);
    expect(addSourcePrompt("merge", local)).toMatch(/local design source at `\/tmp\/components`/);
  });
});

describe("chunkByLevel — group builds atoms → molecules → organisms", () => {
  const comps = [
    { name: "Card", level: "organism" },
    { name: "Button", level: "atom" },
    { name: "Field", level: "molecule" },
    { name: "Input", level: "atom" },
    { name: "Modal", level: "organism" },
    { name: "Label", level: "atom" },
  ];

  it("orders by level then slices into chunks of size", () => {
    const chunks = chunkByLevel(comps, 2);
    // atoms first (Button, Input, Label — original order), then molecule, then organisms.
    expect(chunks.map((c) => c.map((x) => x.name))).toEqual([
      ["Button", "Input"],
      ["Label", "Field"],
      ["Card", "Modal"],
    ]);
  });

  it("defaults to chunks of five and preserves within-level order", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ name: `A${i}`, level: "atom" }));
    const chunks = chunkByLevel(many);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toHaveLength(5);
    expect(chunks[1]).toHaveLength(2);
    expect(chunks[0][0].name).toBe("A0");
  });

  it("treats unknown/missing levels as last", () => {
    const chunks = chunkByLevel(
      [{ name: "Weird", level: null }, { name: "Btn", level: "atom" }],
      5,
    );
    expect(chunks[0].map((c) => c.name)).toEqual(["Btn", "Weird"]);
  });
});

describe("tierForChunk — builds run on the default (best) model, never downgraded", () => {
  it("routes every chunk to opus (= the user's default model, no --model override)", () => {
    // Downgrading builds to Haiku for cost is what broke fidelity; component creation now
    // always uses the full-capability default model, at every level.
    expect(tierForChunk([{ name: "Button", level: "atom" }])).toBe("opus");
    expect(tierForChunk([{ name: "Alert", level: "molecule" }])).toBe("opus");
    expect(tierForChunk([{ name: "Modal", level: "organism" }])).toBe("opus");
  });
});

describe("buildChunkPrompt — scoped to the named components", () => {
  it("names only the chunk's components and forbids building others", () => {
    const p = buildChunkPrompt(["Button", "Input"]);
    expect(p).toContain('"Button", "Input"');
    expect(p).toMatch(/Do NOT build any other component in this run/);
    expect(p).toMatch(/Skip any that already have a source file/);
  });

  it("appends verify, storybook, and manifest steps only when requested", () => {
    const bare = buildChunkPrompt(["Button"]);
    expect(bare).not.toMatch(/\/visual-verify/);
    expect(bare).not.toMatch(/\/storybook/);
    expect(bare).not.toMatch(/\/design-doc/);

    const full = buildChunkPrompt(["Card"], {
      verify: true,
      storybook: true,
      manifest: true,
      url: "http://localhost:6006",
      isFigma: true,
    });
    expect(full).toMatch(/\/visual-verify/);
    expect(full).toMatch(/\/storybook/);
    expect(full).toMatch(/\/design-doc/);
    expect(full).toContain("http://localhost:6006");
    expect(full).toMatch(/Figma MCP/);
  });
});

describe("detection — collapse variant sets + drop internal nodes", () => {
  it("RESCAN_PROMPT carries the component-token extraction contract, rendered from the mapping", () => {
    // Wiring, not wording: the clause must reach the extraction step, and it must carry the
    // mapping function's real output rather than a copy that can drift from the audit.
    expect(RESCAN_PROMPT).toContain(componentTokenExtractionClause());
    expect(RESCAN_PROMPT).toContain(
      componentTokenName("Components/Accordion/Active Item Header Background")!.name,
    );
  });

  it("RESCAN_PROMPT states the extraction rule WITHOUT restating the build-side match rules", () => {
    // The near-colour ban belongs to the build step; two copies of one rule is how they drift.
    const clause = componentTokenExtractionClause();
    expect(clause).not.toContain("four match rules");
    // ...but the build-side rule is still present elsewhere in the prompt family.
    expect(RESCAN_PROMPT.indexOf(clause)).toBeGreaterThan(
      RESCAN_PROMPT.indexOf("Re-extract design tokens"),
    );
  });

  it("RESCAN_PROMPT collapses COMPONENT_SETs and slash-named variant families", () => {
    expect(RESCAN_PROMPT).toMatch(/COLLAPSE VARIANTS/);
    expect(RESCAN_PROMPT).toMatch(/COMPONENT_SET is ONE component/);
    expect(RESCAN_PROMPT).toMatch(/form-item\/horizontal\/input/);
    expect(RESCAN_PROMPT).toMatch(/NOT one entry per combination/);
    // Records the variant axes rather than exploding.
    expect(RESCAN_PROMPT).toMatch(/variants/);
  });

  it("RESCAN_PROMPT excludes internal sub-components + styles by composition, not the components/ folder", () => {
    expect(RESCAN_PROMPT).toMatch(/EXCLUDE internal sub-components and styles/);
    expect(RESCAN_PROMPT).toMatch(/underscore-prefixed/);
    expect(RESCAN_PROMPT).toMatch(/dot-prefixed .* STYLES/);
    expect(RESCAN_PROMPT).toMatch(/used ONLY as a child inside ONE other component/);
    // The `components/` folder must NOT be treated as an internal marker.
    expect(RESCAN_PROMPT).toMatch(/`components\/` folder prefix is NOT by itself an internal marker/);
    // And repairs a prior wrongly-split inventory.
    expect(RESCAN_PROMPT).toMatch(/wrongly split a set into per-variant rows/);
  });

  it("build prompts implement a collapsed variant set as ONE component", () => {
    expect(buildOnePrompt("form-item")).toMatch(/single .* component .* ALL those variants|SINGLE component that covers ALL those variants/i);
    expect(buildChunkPrompt(["form-item"])).toMatch(/SINGLE component that covers ALL those variants/);
  });

  it("RESCAN_PROMPT records the page-per-component reference and flags unreferenced components", () => {
    expect(RESCAN_PROMPT).toMatch(/PAGE-PER-COMPONENT REFERENCE/);
    expect(RESCAN_PROMPT).toMatch(/each\s+PAGE is one component/);
    expect(RESCAN_PROMPT).toMatch(/NORMALIZED name/);
    expect(RESCAN_PROMPT).toMatch(/figmaPage/);
    expect(RESCAN_PROMPT).toMatch(/figmaPageId/);
    expect(RESCAN_PROMPT).toMatch(/"unreferenced": true/);
    // Utility pages are not references; don't point a component at another's page.
    expect(RESCAN_PROMPT).toMatch(/Cover,\s*\n?\s*Typography, Icons/);
    expect(RESCAN_PROMPT).toMatch(/do NOT invent a page/);
  });

  it("RESCAN_PROMPT enumerates ALL pages via the Desktop Bridge and never trusts the 3-page cap", () => {
    // Regression fix: 57fa76c8 steered detection to the remote MCP, whose page listing caps at 3,
    // so a 14-page page-per-component library detected as ~8 doc/foundation entries. Detection must
    // cover the WHOLE file — prefer the Desktop Bridge (sees every page), never the capped listing.
    expect(RESCAN_PROMPT).toMatch(/ENUMERATE THE WHOLE FILE/);
    expect(RESCAN_PROMPT).toMatch(/PREFER the Figma Desktop Bridge/);
    expect(RESCAN_PROMPT).toMatch(/figma\.root\.children/);
    expect(RESCAN_PROMPT).toMatch(/CAPS AT 3 PAGES/);
    expect(RESCAN_PROMPT).toMatch(/first-3 listing as the file's page set/i);
    expect(RESCAN_PROMPT).toMatch(/VARIABLES \+ STYLES/);
    expect(RESCAN_PROMPT).toMatch(/NEVER fabricate a value/);
  });

  it("DESIGN_REFERENCE_CLAUSE resolves the node via id/key then search, not the capped page listing", () => {
    const p = buildOnePrompt("alert");
    expect(p).toMatch(/figmaNodeId.*componentKey/);
    expect(p).toMatch(/search_design_system/);
    expect(p).toMatch(/Desktop Bridge/);
    expect(p).toMatch(/CAPS AT 3/);
  });
});

describe("build prompts state the framework's conventions (change: framework-profile-idioms)", () => {
  it("tells a Svelte build to keep variant classes inside the component", () => {
    const p = buildChunkPrompt(["button"], { framework: "svelte" });
    expect(p).toContain("Svelte");
    expect(p).toContain("$props()");
    expect(p).toContain("class:");
    expect(p).toContain("data-variant");
    // Not because an external module strips the CSS — that claim was refuted on svelte 5.56.8
    // (RESEARCH/VORTSPEC_SVELTE_FIXTURE_2026-08-04.md) — but because CVA is React's idiom and
    // the Svelte contract should name Svelte's.
    expect(p).not.toContain("class-variance-authority");
  });

  it("tells an Angular build the event syntax and what CVA means there", () => {
    const p = buildChunkPrompt(["button"], { framework: "angular" });
    expect(p).toContain("(click)");
    expect(p).toContain("ControlValueAccessor");
  });

  it("carries the framework through buildOnePrompt too", () => {
    expect(buildOnePrompt("button", "atom", "vue")).toContain("defineProps");
  });

  it("no longer names CVA in the shared variant-set reminder", () => {
    // It used to read "via variant props (e.g. CVA)" for every framework — the one
    // framework-flavoured line in a file that is otherwise framework-agnostic.
    const p = buildChunkPrompt(["button"], { framework: "vanilla" });
    expect(p).toMatch(/using this framework's variant mechanism/);
    expect(p).not.toMatch(/e\.g\. CVA/);
  });

  it("blocks the build when the framework is unknown, rather than letting it default to React", () => {
    const p = buildChunkPrompt(["button"], {});
    expect(p).toContain("STOP");
    expect(p).toMatch(/Do NOT generate any component/);
    expect(p).not.toContain("forwardRef");
  });

  it("carries the contract into the new-component paths too", () => {
    expect(newComponentPrompt("card", "a card", "angular")).toContain("(click)");
    expect(newComponentFromFigmaNodePrompt("card", "1:2", "svelte")).toContain("$props()");
    expect(buildRemainingPrompt("vue")).toContain("defineProps");
  });
});

describe("search_design_system must be scoped by includeLibraryKeys (found on a real file)", () => {
  // The clause used to say "scoped to THIS file's own library (from `figma_file_url`)".
  // It is not: fileKey is context, not a filter. A real search for `button` returned 20
  // component sets from 20 different libraries, three with byte-identical descriptions.
  // With 0 of 242 roster entries carrying a figmaNodeId, this is the ONLY resolution path
  // any build uses today.
  it("tells the build to pass includeLibraryKeys, not just the file key", () => {
    const p = buildChunkPrompt(["button"], { framework: "react" });
    expect(p).toContain("includeLibraryKeys");
    expect(p).toMatch(/NOT scoped by the file key alone/);
  });

  it("treats a cross-library-only match as unresolved rather than using it", () => {
    const p = buildChunkPrompt(["button"], { framework: "react" });
    expect(p).toMatch(/ONLY in another library, treat the component as UNRESOLVED/);
  });

  it("forbids picking between same-named candidates by description", () => {
    // Three of the twenty real matches carried identical description text.
    expect(buildChunkPrompt(["button"], { framework: "react" })).toMatch(
      /never pick between same-named candidates by description/,
    );
  });

  it("applies the same scoping to verify, which resolves the reference the same way", () => {
    const p = verifyPrompt("button", "http://localhost:6006", true, "react");
    expect(p).toContain("includeLibraryKeys");
    expect(p).toMatch(/UNRESOLVED/);
  });

  it("no longer claims the file key alone scopes the search", () => {
    const p = buildChunkPrompt(["button"], { framework: "react" });
    expect(p).not.toMatch(/`search_design_system` scoped to THIS file's own/);
  });

  it("says the library key is an lk-… key the URL does not carry", () => {
    // A Figma URL gives the FILE key; `includeLibraryKeys` wants the LIBRARY key, which has to
    // come from result metadata. Telling the agent to "use the key from figma_file_url" would
    // have produced a scoped-looking search that still filtered on the wrong identifier.
    const p = buildChunkPrompt(["button"], { framework: "react" });
    expect(p).toContain("lk-");
    expect(p).toMatch(/URL does NOT/);
    expect(p).toMatch(/metadata of a first, unscoped result/);
  });
});

/**
 * Layer 2 compares token IDENTITY — the re-land of the slice Thor blocked.
 *
 * The blocked version let resolved-VALUE equality authorize a substitution, so a missing
 * component token whose value coincided with an unrelated global was waved through. That
 * objection was theoretical when made and is now measured: Honey rendered the real component
 * through the project's own Tailwind build (PR #85) and `--color-neutral-100` is overridden in
 * the dark theme, so the substituted global carries the component along a palette ramp it was
 * never meant to follow — correct in light, wrong in dark.
 */
describe("verifyPrompt — Layer 2 compares token identity, not syntax or value", () => {
  const p = () => verifyPrompt("accordion", "http://localhost:6006", true);

  it("requires identity — link, canonical name, or explicit alias", () => {
    expect(p()).toMatch(/TOKEN IDENTITY, not token syntax/);
    expect(p()).toMatch(/a durable link, the canonical name, or an explicit alias/);
  });

  it("lets a value match NOMINATE but never AUTHORIZE — Thor's blocker, closed", () => {
    // The exact defect that got the earlier slice reverted. Without this the four match rules
    // still permit a same-value wrong-scope binding.
    expect(p()).toMatch(/may NOMINATE a candidate; it must NEVER authorize binding a[\s\S]{0,40}differently-scoped token/);
    expect(p()).toMatch(/Report a same-value wrong-scope binding as a TOKEN failure, not a pass/);
  });

  it("gives the measured reason, not an argument from principle", () => {
    // The opposite-polarity case Thor required, stated as the rendered fact that makes it true:
    // equal-in-one-theme is not equal-in-every-theme.
    expect(p()).toMatch(/Two tokens equal in one theme are not equal in every theme/);
    expect(p()).toMatch(/correct in light mode and wrong in\s+dark/);
  });

  it("TOKEN-BLOCKS a missing component token and names what to add", () => {
    expect(p()).toMatch(/that\s+is TOKEN-BLOCKED: name the canonical token to add/);
    expect(p()).toMatch(/Do NOT substitute the nearest global/);
  });

  it("says WHY a dangling var() cannot be caught later — it paints and reports nothing", () => {
    // PR #82 case B3, rendered. This is the argument for blocking at bind time rather than
    // trusting any downstream check.
    expect(p()).toMatch(/valid CSS that paints the\s+property's initial value and reports nothing/);
  });

  it("emits the canonical name the mapping currently produces", () => {
    const canonical = componentTokenName("Components/Accordion/Active Item Header Background");
    expect(canonical?.name).toBeTruthy();
    expect(p()).toContain(canonical!.name);
    // NOTE: this asserts AGREEMENT, not derivation. A hardcoded string that happens to be
    // correct passes it — proven by mutation: replacing the interpolation with the literal left
    // all 66 tests green. The derivation itself is pinned by the mocked test below, which is the
    // only thing that can tell "computed" from "currently correct".
  });

  it("keeps the identity rule inside Layer 2, not somewhere its verdict does not govern", () => {
    const text = p();
    const idx = text.indexOf("TOKEN IDENTITY, not token syntax");
    expect(idx).toBeGreaterThan(text.indexOf("Layer 2 — TOKEN"));
    expect(idx).toBeLessThan(text.indexOf("Layer 3 — CODE"));
  });
});
