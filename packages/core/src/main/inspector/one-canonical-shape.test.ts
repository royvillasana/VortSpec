import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalFromCssCustomProperties } from "@vortspec/core/canonical-ingest";
import { canonicalFromVariableModel } from "@vortspec/core/canonical-tokens";
import type { FigmaVariableModel } from "@vortspec/core/inspector";
import type { ExecResult } from "../util/exec";

/**
 * Exactly one canonical shape remains — OpenSpec change: agentic-design-system, task 7.13.
 *
 * `.vortspec/figma-variables.json` held the same facts as `.vortspec/tokens.json` in a different
 * shape: two caches, written by the same sync, free to disagree the moment one of them is refreshed
 * and the other is not. The merge rule in `design.md` says the end state is one canonical file with
 * the flat cache DERIVED or gone. It is now both: never written, still read as a fallback so a
 * project that predates this change keeps working, and projected out of the artifact otherwise.
 */

const hoisted = vi.hoisted(() => ({ userData: "" }));
vi.mock("electron", () => ({
  app: { getName: () => "VortSpec", getPath: () => hoisted.userData },
}));
vi.mock("../util/exec", () => ({ execFileSafe: vi.fn() }));

import { execFileSafe } from "../util/exec";
import { syncVariablesToCache } from "../figma/figma-cli";
import { FIGMA_VARS_PATH, readFigmaVariableModel, readFigmaVariables } from "./figma-reconcile";
import { writeCanonicalTokens } from "./canonical-tokens";

const mocked = vi.mocked(execFileSafe);
let dir = "";
let previousCliDir: string | undefined;

/** Two collections, two modes, an alias — everything the flat cache used to carry. */
const MODEL: FigmaVariableModel = {
  collections: [
    {
      name: "Primitives",
      modes: [
        { id: "m1", name: "Light" },
        { id: "m2", name: "Dark" },
      ],
      defaultModeId: "m1",
    },
    { name: "Semantic", modes: [{ id: "s1", name: "Light" }], defaultModeId: "s1" },
  ],
  variables: [
    {
      name: "color/blue/500",
      collection: "Primitives",
      resolvedType: "COLOR",
      resolvedValue: "#1d4ed8",
      key: "var-key-blue-500",
      valuesByMode: { Light: { value: "#1d4ed8" }, Dark: { value: "#60a5fa" } },
    },
    {
      name: "color/primary",
      collection: "Semantic",
      resolvedType: "COLOR",
      resolvedValue: "#1d4ed8",
      valuesByMode: { Light: { value: "#1d4ed8", aliasOf: "color/blue/500" } },
    },
  ],
};

function result(over: Partial<ExecResult> = {}): ExecResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, ...over };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-one-shape-"));
  hoisted.userData = join(dir, "userData");
  const cliDir = join(dir, "figma-cli");
  await mkdir(join(cliDir, "src"), { recursive: true });
  await writeFile(join(cliDir, "src", "index.js"), "// fake\n", "utf8");
  previousCliDir = process.env.VORTSPEC_FIGMA_CLI_DIR;
  process.env.VORTSPEC_FIGMA_CLI_DIR = cliDir;
  mocked.mockReset();
  mocked.mockImplementation(async (_command: string, args: string[]) => {
    const cli = args.slice(1);
    if (cli[0] === "daemon") return result({ stdout: "Daemon running in Yolo Mode (CDP)" });
    if (cli[0] === "files") return result({ stdout: '[{"name":"Design System"}]' });
    if (cli[0] === "eval") return result({ stdout: JSON.stringify(MODEL) });
    return result({ code: 1 });
  });
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await writeFile(
    join(dir, ".sdd-de", "project.yaml"),
    "framework: react\nlanguage: typescript\nstyling: css\ntoken_file: src/tokens.css\ncomponent_dir: src/components\n",
    "utf8",
  );
});

afterEach(async () => {
  if (previousCliDir === undefined) delete process.env.VORTSPEC_FIGMA_CLI_DIR;
  else process.env.VORTSPEC_FIGMA_CLI_DIR = previousCliDir;
  await rm(dir, { recursive: true, force: true });
});

describe("the flat cache is no longer a second source of truth (task 7.13)", () => {
  it("a sync writes the canonical artifact and NOT figma-variables.json", async () => {
    await syncVariablesToCache(dir);

    await expect(readFile(join(dir, ".vortspec/tokens.json"), "utf8")).resolves.toContain("color");
    await expect(readFile(join(dir, FIGMA_VARS_PATH), "utf8")).rejects.toThrow();
  });

  it("still answers the full model afterwards — projected, not stored", async () => {
    await syncVariablesToCache(dir);

    const model = await readFigmaVariableModel(dir);

    expect(model).not.toBeNull();
    // The collection registry survives: it is what the mode switcher and `deriveModeMap` read, and
    // it was the one thing the flat rows could not carry.
    expect(model!.collections.map((c) => c.name)).toEqual(["Primitives", "Semantic"]);
    const primitives = model!.collections.find((c) => c.name === "Primitives")!;
    expect(primitives.modes.map((m) => m.name)).toEqual(["Light", "Dark"]);
    expect(primitives.defaultModeId).toBe("Light");

    const blue = model!.variables.find((v) => v.name === "color/blue/500")!;
    expect(blue.valuesByMode?.Dark?.value).toBe("#60a5fa");
    expect(blue.key).toBe("var-key-blue-500"); // the durable join survives the round trip
    const primary = model!.variables.find((v) => v.name === "color/primary")!;
    expect(primary.valuesByMode?.Light?.aliasOf).toBe("color/blue/500");
  });

  it("keeps reading a legacy cache when the project has no artifact yet", async () => {
    // The whole point of derive-then-retire rather than delete: an existing project has this file
    // and no `tokens.json` until its next sync, and it must not read as "never synced".
    await mkdir(join(dir, ".vortspec"), { recursive: true });
    await writeFile(join(dir, FIGMA_VARS_PATH), JSON.stringify(MODEL, null, 2), "utf8");

    const model = await readFigmaVariableModel(dir);

    expect(model!.variables.map((v) => v.name)).toEqual(["color/blue/500", "color/primary"]);
    expect(model!.collections).toHaveLength(2);
  });

  it("prefers the artifact when both exist, so a stale cache cannot win", async () => {
    await mkdir(join(dir, ".vortspec"), { recursive: true });
    // A stale flat cache from before the sync…
    await writeFile(
      join(dir, FIGMA_VARS_PATH),
      JSON.stringify({ collections: [], variables: [{ name: "stale/token", resolvedValue: "#000" }] }),
      "utf8",
    );
    const { document } = canonicalFromVariableModel(MODEL, { source: "figma" });
    await writeCanonicalTokens(dir, document);

    const names = (await readFigmaVariables(dir))!.map((v) => v.name);

    expect(names).toContain("color/blue/500");
    expect(names).not.toContain("stale/token");
  });

  it("returns null — not a false sync — when the artifact came from a stylesheet", async () => {
    // Since 7.10 an artifact can be built from the project's OWN CSS. Projecting that would report
    // a Figma sync for a project that has never opened Figma: every token would "match" itself and
    // the Inspector would show a design system in perfect sync with a tool it isn't connected to.
    const { document } = canonicalFromCssCustomProperties(":root { --color-primary: #1d4ed8; }", {
      source: "css",
    });
    await writeCanonicalTokens(dir, document);

    expect(await readFigmaVariableModel(dir)).toBeNull();
  });

  it("falls back to a legacy cache even when a non-design-tool artifact exists", async () => {
    // The two facts are independent: the project really did sync with Figma once, and it also has a
    // stylesheet-derived artifact. The Figma answer must come from the cache, not be suppressed.
    const { document } = canonicalFromCssCustomProperties(":root { --a: 1px; }", { source: "css" });
    await writeCanonicalTokens(dir, document);
    await writeFile(join(dir, FIGMA_VARS_PATH), JSON.stringify(MODEL, null, 2), "utf8");

    const model = await readFigmaVariableModel(dir);

    expect(model!.variables.map((v) => v.name)).toContain("color/blue/500");
  });
});
