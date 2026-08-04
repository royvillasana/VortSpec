import { describe, expect, it } from "vitest";
import {
  buildFigmaHygieneAuditPrompt,
  buildFigmaHygieneRepairPrompt,
  parseHygieneAuditResult,
  rosterPatchFromAudit,
} from "./figma-hygiene";

const FILE = "https://figma.com/design/ABC/DS";

describe("figma hygiene audit prompt", () => {
  it("is read-only and resolves every roster component to a node id", () => {
    const p = buildFigmaHygieneAuditPrompt({
      fileUrl: FILE,
      roster: [{ name: "button" }, { name: "alert" }],
      bridgeConnected: true,
    });
    expect(p).toContain(FILE);
    expect(p).toContain("READ ONLY");
    expect(p).toContain("Account for all 2 components");
    expect(p).toContain("NODE RESOLUTION (blocking)");
    // The structured return is what lets the app persist ids — it must be demanded.
    expect(p).toContain("RESULT:");
    expect(p).toContain("never invent a node id");
  });

  it("re-verifies an already-recorded node instead of silently trusting it", () => {
    const p = buildFigmaHygieneAuditPrompt({
      fileUrl: FILE,
      roster: [{ name: "button", figmaNodeId: "1:23" }],
      bridgeConnected: true,
    });
    expect(p).toContain("recorded node 1:23 — VERIFY it still resolves");
  });

  it("warns about the 3-page listing cap only when the bridge is absent", () => {
    const withBridge = buildFigmaHygieneAuditPrompt({ fileUrl: FILE, roster: [], bridgeConnected: true });
    const noBridge = buildFigmaHygieneAuditPrompt({ fileUrl: FILE, roster: [], bridgeConnected: false });
    expect(withBridge).toContain("figma.root.children");
    expect(withBridge).not.toContain("CAPS AT 3 PAGES");
    expect(noBridge).toContain("CAPS AT 3 PAGES");
    expect(noBridge).toContain("search_design_system");
  });

  it("handles an empty roster by enumerating the file", () => {
    const p = buildFigmaHygieneAuditPrompt({ fileUrl: FILE, roster: [], bridgeConnected: false });
    expect(p).toContain("No roster was supplied");
    expect(p).not.toContain("Account for all");
  });

  it("stays framework-neutral — no framework or code idiom leaks into the design audit", () => {
    const p = buildFigmaHygieneAuditPrompt({
      fileUrl: FILE,
      roster: [{ name: "button" }],
      bridgeConnected: true,
    });
    // Framework/code idioms must not appear. Note "properties" is deliberately NOT a leak —
    // "variant properties" is Figma's own term for them, not a code convention.
    for (const leak of ["React", "Vue", "Svelte", "Angular", "CVA", "forwardRef", "props", "TypeScript", "camelCase", "PascalCase", ".tsx"]) {
      expect(p).not.toContain(leak);
    }
    expect(p).toContain("FRAMEWORK-NEUTRAL");
    expect(p).toContain("variant properties");
  });

  it("never lets an unverified check be reported as a pass", () => {
    const p = buildFigmaHygieneAuditPrompt({ fileUrl: FILE, roster: [], bridgeConnected: true });
    expect(p).toContain("an unverified check is UNKNOWN, never PASS");
  });
});

describe("figma hygiene repair prompt", () => {
  it("dry run writes nothing and lists the edits for approval", () => {
    const p = buildFigmaHygieneRepairPrompt({ fileUrl: FILE, findings: "axis Property 1", dryRun: true });
    expect(p).toContain("DRY RUN");
    expect(p).toContain("write NOTHING to Figma");
    expect(p).toContain("approval before anything is applied");
    expect(p).not.toContain("APPLY the approved edits");
  });

  it("apply mode is scoped to the approved findings", () => {
    const p = buildFigmaHygieneRepairPrompt({ fileUrl: FILE, findings: "axis Property 1", dryRun: false });
    expect(p).toContain("APPLY the approved edits");
    expect(p).toContain("Make ONLY these edits");
    expect(p).toContain("axis Property 1");
  });

  it("keeps destructive and appearance-changing edits out of scope in both modes", () => {
    for (const dryRun of [true, false]) {
      const p = buildFigmaHygieneRepairPrompt({ fileUrl: FILE, findings: "x", dryRun });
      expect(p).toContain("OUT OF SCOPE");
      expect(p).toContain("Creating, deleting, moving, or reparenting");
      expect(p).toContain("Binding a raw value to a variable");
      expect(p).toContain("Renaming a variant VALUE");
    }
  });

  it("forbids renaming toward a code convention", () => {
    const p = buildFigmaHygieneRepairPrompt({ fileUrl: FILE, findings: "x", dryRun: true });
    expect(p).toContain("Never rename anything toward a code convention");
    expect(p).toContain("no PascalCase-for-React");
  });
});

describe("parseHygieneAuditResult", () => {
  const line = (o: unknown) => `blah blah\nRESULT: ${JSON.stringify(o)}`;

  it("parses a well-formed result", () => {
    const r = parseHygieneAuditResult(
      line({
        components: [
          {
            name: "button",
            nodeId: "1:23",
            pageId: "0:1",
            pageName: "button",
            variantAxes: ["type", "size"],
            hasDescription: true,
            unboundValues: 0,
            issues: [],
          },
        ],
        blocking: 0,
        advisory: 1,
        unresolved: ["ghost-card"],
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.components[0].nodeId).toBe("1:23");
    expect(r!.components[0].variantAxes).toEqual(["type", "size"]);
    expect(r!.advisory).toBe(1);
    expect(r!.unresolved).toEqual(["ghost-card"]);
  });

  it("returns null when the result line is absent or malformed", () => {
    expect(parseHygieneAuditResult("no result here")).toBeNull();
    expect(parseHygieneAuditResult("RESULT: {not json")).toBeNull();
    // A result with no components array is not a clean file — it is an incomplete run.
    expect(parseHygieneAuditResult(line({ blocking: 0 }))).toBeNull();
  });

  it("FAILS CLOSED on malformed counts — an incomplete run must not read as clean", () => {
    // Was: this blessed `blocking: "x"` as a successful zero-blocker result. A caller then reads
    // "0 blockers" from a run that never reported any, which is absence of evidence sold as
    // evidence of absence.
    expect(parseHygieneAuditResult(line({ components: [{ name: "alert" }], blocking: "x", advisory: 0, unresolved: [] }))).toBeNull();
    expect(parseHygieneAuditResult(line({ components: [], advisory: 0, unresolved: [] }))).toBeNull();
    expect(parseHygieneAuditResult(line({ components: [], blocking: 0, unresolved: [] }))).toBeNull();
    expect(parseHygieneAuditResult(line({ components: [], blocking: 0, advisory: 0 }))).toBeNull();
  });

  it("coerces missing per-component fields rather than throwing", () => {
    const r = parseHygieneAuditResult(line({ components: [{ name: "alert" }], blocking: 0, advisory: 0, unresolved: [] }));
    expect(r!.components[0]).toEqual({
      name: "alert",
      nodeId: null,
      libraryKey: null,
      pageId: null,
      pageName: null,
      variantAxes: [],
      hasDescription: false,
      unboundValues: null,
      issues: [],
    });
    expect(r!.blocking).toBe(0);
  });

  it("drops entries with no usable name", () => {
    const r = parseHygieneAuditResult(
      line({ components: [{ nodeId: "1:2" }, { name: "ok", nodeId: "1:3" }], blocking: 0, advisory: 0, unresolved: [] }),
    );
    expect(r!.components).toHaveLength(1);
    expect(r!.components[0].name).toBe("ok");
  });
});

const OWN = "lk-own";
const OTHER = "lk-someone-elses";
const comp = (over: Record<string, unknown>) => ({
  name: "x", nodeId: null, libraryKey: null, pageId: null, pageName: null,
  variantAxes: [], hasDescription: false, unboundValues: null, issues: [], ...over,
});
const result = (components: unknown[]) =>
  ({ components, blocking: 0, advisory: 0, unresolved: [] }) as never;

describe("rosterPatchFromAudit — the library gate", () => {
  it("patches a component whose observed library matches the expected one", () => {
    const { patch, rejected } = rosterPatchFromAudit(
      result([comp({ name: "button", nodeId: "1:23", libraryKey: OWN, pageId: "0:1", pageName: "button" })]),
      OWN,
    );
    expect(patch).toEqual([{ name: "button", figmaNodeId: "1:23", figmaPage: "button", figmaPageId: "0:1" }]);
    expect(rejected).toEqual([]);
  });

  it("omits page fields the audit could not determine", () => {
    const { patch } = rosterPatchFromAudit(
      result([comp({ name: "badge", nodeId: "9:9", libraryKey: OWN })]),
      OWN,
    );
    expect(patch).toEqual([{ name: "badge", figmaNodeId: "9:9" }]);
  });

  // Thor's blocker 3: without this the cross-library fix stops at the prompt.
  it("REJECTS a node resolved from another library, however well its name matches", () => {
    const { patch, rejected } = rosterPatchFromAudit(
      result([comp({ name: "button", nodeId: "1:23", libraryKey: OTHER })]),
      OWN,
    );
    expect(patch).toEqual([]);
    expect(rejected).toEqual([
      { name: "button", observedLibraryKey: OTHER, reason: "node came from another library" },
    ]);
  });

  it("REJECTS a node whose run reported no library at all — unverified is not a match", () => {
    const { patch, rejected } = rosterPatchFromAudit(
      result([comp({ name: "button", nodeId: "1:23", libraryKey: null })]),
      OWN,
    );
    expect(patch).toEqual([]);
    expect(rejected[0].reason).toBe("run reported no library key");
  });

  it("emits NOTHING when no expected key is supplied, and says why", () => {
    // The key cannot be inferred from the audit's own results without circularity, so a caller
    // must supply it. Returning an unfiltered patch would be the fail-open shape being removed.
    const { patch, rejected } = rosterPatchFromAudit(
      result([comp({ name: "button", nodeId: "1:23", libraryKey: OWN })]),
      null,
    );
    expect(patch).toEqual([]);
    expect(rejected[0].reason).toMatch(/no expected library key/);
  });

  it("ignores components that never resolved to a node", () => {
    const { patch, rejected } = rosterPatchFromAudit(
      result([comp({ name: "mystery", nodeId: null, libraryKey: OWN })]),
      OWN,
    );
    expect(patch).toEqual([]);
    expect(rejected).toEqual([]);
  });
});
