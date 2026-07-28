import { describe, expect, it } from "vitest";
import { deriveLiteManifest, serializeLiteManifest, findFrameworkPointers, type DeriveInput } from "./lite-manifest";
import { buildLightStandInPrompt } from "./light-standin";
import { buildTwoTrackBuildPrompt } from "./two-track";
import { compileLightPage, isFullyDeterministic, type LightNode, type CompileOptions } from "./compile";
import { buildReadinessReport, compileBlockers, type ContractIdentity } from "./readiness";

/**
 * End-to-end integration of the light-design-system flow (OpenSpec change: light-design-system, task 7).
 * This threads the PURE modules the way the app does — contract → lite manifest → designer.md → two-track
 * prompt → authored light page → deterministic compile → readiness gate — and asserts the invariants
 * (7.2): no direct Figma (the agent reads via MCP), token discipline end-to-end, single source of truth
 * per phase, identity convergence. The live GUI run on a real Figma project (7.1) stays manual; this is
 * the automated proof the data flow holds together.
 */
describe("light-design-system end-to-end (data flow)", () => {
  // ── The shared contract (extract-design-system output): ONE source of identity for both tracks. ──
  const CONTRACT: ContractIdentity[] = [
    { name: "Button", variants: ["primary", "secondary"], props: [{ name: "variant", type: "enum" }] },
    { name: "Card", variants: [] },
  ];
  // The token set — the SINGLE source of truth threaded through palette AND compile.
  const TOKENS: DeriveInput["tokens"] = [
    { name: "color-brand", value: "#6b8afd", group: "colors" },
    { name: "color-surface", value: "#ffffff", group: "colors" },
    { name: "space-4", value: "16px", group: "spacing" },
    { name: "radius-2", value: "8px", group: "radius" },
  ];

  it("phase 1 — the light shelf is derivable + usable immediately, with NO framework pointers", () => {
    const input: DeriveInput = {
      projectName: "Acme",
      tokens: TOKENS,
      components: [
        { name: "Button", tier: "atom", variants: ["primary", "secondary"], props: [{ name: "variant", type: "enum", default: "primary" }], readiness: "framework-ready" },
        { name: "Card", tier: "molecule", variants: [], readiness: "light-only" },
      ],
      standIns: {
        Button: [
          { variant: "primary", html: '<button style="background-color:#6b8afd">Go</button>', source: "harvested" },
          { variant: "secondary", html: '<button style="background-color:#ffffff">Go</button>', source: "harvested" },
        ],
      },
    };
    const manifest = deriveLiteManifest(input);
    // Button is coded AND fully harvested → framework-ready; Card has only placeholders → light-only.
    expect(manifest.components.find((c) => c.name === "Button")?.readiness).toBe("framework-ready");
    expect(manifest.components.find((c) => c.name === "Card")?.readiness).toBe("light-only");
    // designer.md — the ONLY design context the light-authoring LLM sees — must carry NO framework pointers.
    const designerMd = serializeLiteManifest(manifest);
    expect(findFrameworkPointers(designerMd)).toEqual([]);
    // Dual-keyed: token NAME + resolved VALUE both present (so light HTML renders standalone).
    expect(designerMd).toContain("color-brand");
    expect(designerMd).toContain("#6b8afd");
  });

  it("phase 2 — the two-track build prompt reuses one Figma read, light-first (no direct Figma from core)", () => {
    const targets = [
      { name: "Button", tier: "atom", figmaNodeId: "1:1", variants: ["primary", "secondary"] },
      { name: "Card", tier: "molecule", figmaNodeId: "2:2", variants: [] },
    ];
    // Track 1 alone (the "Generate previews" flow) and the full two-track both pin the invariants.
    expect(buildLightStandInPrompt(targets)).toMatch(/get_design_context/);
    const prompt = buildTwoTrackBuildPrompt(targets);
    expect(prompt.indexOf("TRACK 1 — LIGHT")).toBeLessThan(prompt.indexOf("TRACK 2 — FRAMEWORK"));
    expect(prompt).toMatch(/ONE Figma read/i);
    // Core never calls Figma — the prompt tells the AGENT to use the MCP read.
    expect(prompt).toMatch(/Figma MCP|get_design_context/);
  });

  // ── A page authored on the light surface: framework-free, resolved token values, data-component marks. ──
  const AUTHORED_PAGE: LightNode = {
    tag: "section",
    styles: { "background-color": "#6b8afd", padding: "16px", "border-radius": "8px" },
    children: [
      { tag: "div", component: "Button", props: { variant: "primary" }, text: "Get started" },
      { tag: "div", component: "Card", children: [{ tag: "p", text: "A listing" }] },
    ],
  };

  // The compile options are built FROM THE SAME token set — single source of truth per phase.
  const compileOpts: CompileOptions = {
    valueToTokenRef: new Map(TOKENS.map((t) => [t.value, `var(--${t.name})`])),
    knownTokenValues: new Set(TOKENS.map((t) => t.value)),
  };

  it("phase 3 — the authored page compiles deterministically: tokens restored, components mapped, lint clean", () => {
    const res = compileLightPage(AUTHORED_PAGE, compileOpts);
    // Token discipline end-to-end: every styled value became a token reference, none leaked raw.
    expect(res.code).toContain('var(--color-brand)');
    expect(res.code).toContain('var(--space-4)');
    expect(res.code).toContain('var(--radius-2)');
    expect(res.lintIssues).toEqual([]);
    // Components mapped by contract identity (name + variant).
    expect(res.code).toContain('<Button variant="primary">');
    expect(res.usedComponents.sort()).toEqual(["Button", "Card"]);
    // Fully deterministic — no residual needing AI, no discipline leak.
    expect(isFullyDeterministic(res)).toBe(true);
    expect(res.deterministicCoverage.tokensRestored).toBe(3);
  });

  it("phase 4 — readiness is a soft, per-component gate: palette usable now, gate flips as framework lands", () => {
    // At extraction: nothing built → palette usable immediately, everything catching up.
    const before = buildReadinessReport(CONTRACT, {});
    expect(before.paletteUsable).toBe(true);
    expect(before.catchingUp.sort()).toEqual(["Button", "Card"]);

    // Button's framework component lands + is harvested; its identity matches the contract → converges.
    const after = buildReadinessReport(CONTRACT, {
      Button: {
        exists: true,
        harvestedVariants: ["primary", "secondary"],
        identity: { name: "Button", variants: ["primary", "secondary"], props: [{ name: "variant", type: "enum" }] },
      },
    });
    expect(after.components.find((c) => c.name === "Button")?.readiness).toBe("framework-ready");
    expect(after.catchingUp).toEqual(["Card"]);
    expect(after.diverged).toEqual([]); // identity converged by construction

    // The page used Button + Card; only Card blocks a shippable compile (Button is ready).
    const used = compileLightPage(AUTHORED_PAGE, compileOpts).usedComponents;
    expect(compileBlockers(used, after)).toEqual(["Card"]);
    expect(compileBlockers(used, before).sort()).toEqual(["Button", "Card"]);
  });

  it("phase 4b — convergence catches framework drift from the contract (name/variant/prop)", () => {
    const drifted = buildReadinessReport(CONTRACT, {
      Button: {
        exists: true,
        harvestedVariants: ["primary"],
        identity: { name: "Button", variants: ["primary"], props: [{ name: "variant", type: "enum" }] }, // dropped "secondary"
      },
    });
    expect(drifted.diverged).toContain("Button");
    // A drifted/partial framework component is NOT framework-ready (missing harvested variant).
    expect(drifted.components.find((c) => c.name === "Button")?.readiness).toBe("light-only");
  });
});
