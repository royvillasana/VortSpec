import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInspectorTokens } from "./token-parser";

/**
 * Slice 3 (change: token-fidelity-sanitation): reconcile routes through the
 * layered resolver, so a token that exists under a different name but the same
 * value reconciles by value instead of showing as unmatched — the Excellus
 * `--font-size-md` ↔ `typography/font-size/md` case.
 */
async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, ".vortspec"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "token_file: tokens.css\n", "utf8");
  await writeFile(
    join(dir, "tokens.css"),
    ":root {\n  --font-size-md: 18px;\n  --color-surface-on: #FFFFFF;\n}\n",
    "utf8",
  );
  await writeFile(
    join(dir, ".vortspec/figma-variables.json"),
    JSON.stringify({
      collections: [{ name: "Tokens", modes: [{ id: "d", name: "Default" }], defaultModeId: "d" }],
      variables: [
        // Different name, same value → must match --font-size-md by value.
        { name: "typography/font-size/md", collection: "Tokens", resolvedType: "FLOAT", resolvedValue: "18px", valuesByMode: { Default: { value: "18px" } } },
        // Name-equal (formatting only) → matches by name.
        { name: "color/surface/on", collection: "Tokens", resolvedType: "COLOR", resolvedValue: "#FFFFFF", valuesByMode: { Default: { value: "#FFFFFF" } } },
        // Nothing in code → stays Figma-only.
        { name: "color/brand/unused", collection: "Tokens", resolvedType: "COLOR", resolvedValue: "#123456", valuesByMode: { Default: { value: "#123456" } } },
      ],
    }),
    "utf8",
  );
}

describe("reconcile via the resolver", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-resolve-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("matches a value-equal token under a different name (signal=value, in-sync)", async () => {
    const r = await getInspectorTokens(dir);
    const t = r.tokens.find((x) => x.name === "font-size-md");
    expect(t?.matchSignal).toBe("value");
    expect(t?.figmaPath).toBe("typography/font-size/md");
    expect(t?.drift).toBe("in-sync");
  });

  it("still matches a name-equal token by name", async () => {
    const t = (await getInspectorTokens(dir)).tokens.find((x) => x.name === "color-surface-on");
    expect(t?.matchSignal).toBe("name");
    expect(t?.figmaPath).toBe("color/surface/on");
  });

  it("does not list a value-matched variable as Figma-only", async () => {
    const r = await getInspectorTokens(dir);
    const onlyNames = r.figmaOnly.map((v) => v.name);
    expect(onlyNames).toContain("color/brand/unused");
    expect(onlyNames).not.toContain("typography/font-size/md");
  });
});
