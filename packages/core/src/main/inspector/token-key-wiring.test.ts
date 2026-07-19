import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInspectorTokens } from "./token-parser";

/**
 * Plan B1b — durable-key join, wired end to end through getInspectorTokens.
 * A first pass name-matches a keyed Figma variable and records its variableKey in
 * `.vortspec/maps/tokens.json`. After the variable is RENAMED and its value CHANGED
 * in Figma (both name and value joins now fail), the token still resolves — by key.
 */
async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, ".vortspec"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "token_file: tokens.css\n", "utf8");
  await writeFile(join(dir, "tokens.css"), ":root {\n  --color-primary: #0055FF;\n}\n", "utf8");
  await writeVars(dir, "color-primary", "#0055FF");
}

async function writeVars(dir: string, name: string, value: string): Promise<void> {
  await writeFile(
    join(dir, ".vortspec/figma-variables.json"),
    JSON.stringify({
      collections: [{ name: "Tokens", modes: [{ id: "d", name: "Default" }], defaultModeId: "d" }],
      variables: [
        { name, key: "KEY_PRIMARY", collection: "Tokens", resolvedType: "COLOR", resolvedValue: value, valuesByMode: { Default: { value } } },
      ],
    }),
    "utf8",
  );
}

describe("durable key survives a Figma rename + value change (B1b)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vortspec-key-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("records the variableKey on a confident name match", async () => {
    const t = (await getInspectorTokens(dir)).tokens.find((x) => x.name === "color-primary");
    expect(t?.matchSignal).toBe("name");
    const map = JSON.parse(await readFile(join(dir, ".vortspec/maps/tokens.json"), "utf8"));
    expect(map.tokens["color-primary"]).toEqual({ variableKey: "KEY_PRIMARY", value: "#0055FF" });
  });

  it("re-resolves by key after the Figma variable is renamed AND revalued", async () => {
    await getInspectorTokens(dir); // pass 1 — populate the map by name
    // Figma rename + value change: name no longer matches, value no longer matches.
    await writeVars(dir, "brand/primary-renamed", "#FF0000");
    const t = (await getInspectorTokens(dir)).tokens.find((x) => x.name === "color-primary");
    expect(t?.matchSignal).toBe("key");
    expect(t?.figmaPath).toBe("brand/primary-renamed");
    expect(t?.drift).toBe("drifted"); // value diverged, but the join held
  });
});
