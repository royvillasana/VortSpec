import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVerification } from "./verification-reader";

const REPORT = `# Visual Verify Report — Callout

## Resolved discrepancies

### D1 — Icon large size is not token-backed  · \`icon.variants.ts:13\`
The large icon uses an unmapped spacing key. **Status: OPEN.**

### D2 — Callout nudge removed
Was 2px off-grid. **Status: RESOLVED.**

## Observations (non-blocking)

- **O-A — redundant border width.** The base class lists both border classes.
`;

describe("verification-reader", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-verify-"));
    await mkdir(join(dir, "specs", "callout"), { recursive: true });
    await writeFile(join(dir, "specs", "callout", "visual-verify-report.md"), REPORT, "utf8");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("parses discrepancies as errors with open/resolved status", async () => {
    const { findings } = await getVerification(dir);
    const d1 = findings.find((f) => f.rawId === "D1");
    const d2 = findings.find((f) => f.rawId === "D2");
    expect(d1).toMatchObject({ severity: "error", group: "visual", component: "callout", status: "open" });
    expect(d2?.status).toBe("resolved");
    expect(d1?.ref).toBe("icon.variants.ts:13");
  });

  it("parses observation bullets as info findings", async () => {
    const { findings } = await getVerification(dir);
    const oa = findings.find((f) => f.rawId === "O-A");
    expect(oa?.severity).toBe("info");
    expect(oa?.title).toContain("redundant border width");
  });

  it("returns nothing when there are no reports", async () => {
    const empty = await mkdtemp(join(tmpdir(), "vortspec-empty-"));
    expect((await getVerification(empty)).findings).toEqual([]);
    await rm(empty, { recursive: true, force: true });
  });
});
