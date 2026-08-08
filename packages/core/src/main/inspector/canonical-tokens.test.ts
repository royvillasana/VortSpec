import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCanonicalTokens, writeCanonicalTokens } from "./canonical-tokens";
import { canonicalFromVariableModel } from "@vortspec/core/canonical-tokens";
import { CANONICAL_TOKENS_PATH } from "@vortspec/core/design-tokens";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-canonical-tokens-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the canonical token artifact on disk (task 7.2)", () => {
  it("writes the nested tree to .vortspec/tokens.json and reads it back", async () => {
    const { document } = canonicalFromVariableModel({
      collections: [{ name: "Core", modes: [{ id: "1:0", name: "Light" }], defaultModeId: "1:0" }],
      variables: [
        {
          name: "primitive/color/primary",
          resolvedValue: "#7C6FF0",
          collection: "Core",
          resolvedType: "COLOR",
          valuesByMode: { Light: { value: "#7C6FF0" } },
        },
      ],
    });
    await writeCanonicalTokens(dir, document);

    const raw = await readFile(join(dir, CANONICAL_TOKENS_PATH), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(JSON.parse(raw).primitive.color.primary.$value).toBe("#7C6FF0");
    expect(JSON.parse(raw)["primitive/color/primary"]).toBeUndefined();

    const back = await readCanonicalTokens(dir);
    expect(back).toEqual(document);
  });

  it("reads as absent for a project that only has the older figma-variables.json", async () => {
    await mkdir(join(dir, ".vortspec"), { recursive: true });
    await writeFile(
      join(dir, ".vortspec/figma-variables.json"),
      JSON.stringify({ collections: [], variables: [] }),
      "utf8",
    );
    expect(await readCanonicalTokens(dir)).toBeNull();
  });

  it("reads as absent — not a throw — when the artifact is corrupt", async () => {
    await mkdir(join(dir, ".vortspec"), { recursive: true });
    await writeFile(join(dir, CANONICAL_TOKENS_PATH), "{ not json", "utf8");
    expect(await readCanonicalTokens(dir)).toBeNull();
  });
});
