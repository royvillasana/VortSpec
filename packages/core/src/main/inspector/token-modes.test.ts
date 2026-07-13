import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInspectorTokens, setInspectorTokenValue, writeTokenModeMap } from "./token-parser";

/**
 * Integration coverage for the mode/group-aware model (change:
 * figma-native-token-model): a token file with a `:root` (Light) and `.dark`
 * context reconciled against a two-mode Figma collection.
 */
async function scaffold(dir: string, opts: { dark?: string } = {}): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, ".vortspec"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "token_file: tokens.css\n", "utf8");
  const dark = opts.dark ?? "#2A2540";
  await writeFile(
    join(dir, "tokens.css"),
    `:root {\n  --color-primary: #7C6FF0;\n  --radius-md: 8px;\n}\n.dark {\n  --color-primary: ${dark};\n}\n`,
    "utf8",
  );
  await writeFile(
    join(dir, ".vortspec/figma-variables.json"),
    JSON.stringify({
      collections: [
        {
          name: "Theme",
          modes: [
            { id: "1:0", name: "Light" },
            { id: "1:1", name: "Dark" },
          ],
          defaultModeId: "1:0",
        },
      ],
      variables: [
        {
          name: "color/primary",
          resolvedValue: "#7C6FF0",
          collection: "Theme",
          resolvedType: "COLOR",
          valuesByMode: { Light: { value: "#7C6FF0" }, Dark: { value: "#2A2540" } },
        },
      ],
    }),
    "utf8",
  );
}

describe("getInspectorTokens — mode & group aware", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-modes-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("surfaces collections, an active mode, and a derived mode map", async () => {
    await scaffold(dir);
    const r = await getInspectorTokens(dir);
    expect(r.collections.map((c) => c.name)).toEqual(["Theme"]);
    expect(r.activeCollection).toBe("Theme");
    expect(r.activeMode).toBe("Light");
    expect(r.modeMap).toMatchObject({ Light: ":root", Dark: ".dark" });
  });

  it("reports each mode in-sync when code matches Figma per mode", async () => {
    await scaffold(dir); // dark code value == figma Dark value
    const t = (await getInspectorTokens(dir)).tokens.find((x) => x.name === "color-primary");
    expect(t?.figmaPath).toBe("color/primary");
    expect(t?.group).toEqual(["color"]);
    expect(t?.modes?.Light.drift).toBe("in-sync");
    expect(t?.modes?.Dark.drift).toBe("in-sync");
  });

  it("catches a genuine per-mode difference as drift", async () => {
    await scaffold(dir, { dark: "#000000" }); // dark code value drifts from figma Dark
    const t = (await getInspectorTokens(dir)).tokens.find((x) => x.name === "color-primary");
    expect(t?.modes?.Light.drift).toBe("in-sync");
    expect(t?.modes?.Dark.drift).toBe("drifted");
    expect(t?.modes?.Dark.figmaValue).toBe("#2A2540");
  });

  it("cascades a non-themed code-only token's :root value into a mapped mode (not read-only)", async () => {
    await scaffold(dir);
    const t = (await getInspectorTokens(dir)).tokens.find((x) => x.name === "radius-md");
    // radius-md is declared only in :root and has no Figma match; in the mapped
    // Dark context its :root value cascades and it stays editable/pushable.
    expect(t?.modes?.Dark.readOnly).toBe(false);
    expect(t?.modes?.Dark.resolvedValue).toBe("8px");
    expect(t?.modes?.Dark.figmaValue).toBeUndefined();
  });

  it("marks a mode with no mapped code context read-only", async () => {
    await scaffold(dir);
    // Remap Dark to a context the file doesn't define.
    await writeTokenModeMap(dir, { Light: ":root", Dark: "[data-theme='night']" });
    const t = (await getInspectorTokens(dir)).tokens.find((x) => x.name === "color-primary");
    expect(t?.modes?.Dark.readOnly).toBe(true);
    expect(t?.modes?.Dark.drift).toBeUndefined();
  });

  it("scopes a per-mode edit to that context's block only", async () => {
    await scaffold(dir);
    await setInspectorTokenValue(dir, "color-primary", "#FF0000", ".dark");
    const css = await readFile(join(dir, "tokens.css"), "utf8");
    // The .dark block changed; the :root (Light) value is untouched.
    expect(css).toContain("--color-primary: #7C6FF0;");
    expect(css).toMatch(/\.dark \{[\s\S]*--color-primary: #FF0000;/);
  });
});
