import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecResult } from "../util/exec";

/**
 * One scan, many emits — OpenSpec change: agentic-design-system, task 7.9.
 *
 * The claim under test is an ARCHITECTURAL one, so it is tested where it can actually break: across
 * the seam between ingest (`syncVariablesToCache`, which talks to the design source) and emit
 * (`emitTokenFiles`, which must not). Unit-testing either half alone would prove nothing — the
 * regression this guards against is someone re-reading Figma inside the emit path "to be safe", and
 * that only shows up when both halves run against the same project.
 *
 * The design source is counted, not stubbed away: `execFileSafe` is the ONLY way figma-cli is
 * reached, so a call count on it is a faithful count of design-source requests. The assertions are
 * on that count staying flat, which is why the mock is shared across the whole file rather than
 * reset between the two halves of each test.
 */

const hoisted = vi.hoisted(() => ({ userData: "" }));

// figma-cli reads `app.getPath("userData")` to remember the last connect mode. Pointed at the temp
// project so a test run never touches the real app's directory.
vi.mock("electron", () => ({
  app: { getName: () => "VortSpec", getPath: () => hoisted.userData },
}));
vi.mock("../util/exec", () => ({ execFileSafe: vi.fn() }));

import { execFileSafe } from "../util/exec";
import { syncVariablesToCache } from "../figma/figma-cli";
import { emitTokenFiles } from "./token-emit";
import { CANONICAL_TOKENS_PATH } from "@vortspec/core/design-tokens";
import { SUPPORTED_STYLING_APPROACHES } from "@vortspec/core/token-emitters";

const mocked = vi.mocked(execFileSafe);

let dir = "";
let cliDir = "";
let previousCliDir: string | undefined;

/** The variable model the fake figma-cli returns — two modes, an alias, and three token groups. */
const MODEL = {
  collections: [
    {
      name: "Theme",
      modes: [
        { id: "m1", name: "Light" },
        { id: "m2", name: "Dark" },
      ],
      defaultModeId: "m1",
    },
  ],
  variables: [
    {
      name: "color/blue/500",
      collection: "Theme",
      resolvedType: "COLOR",
      resolvedValue: "#1d4ed8",
      valuesByMode: { Light: { value: "#1d4ed8" }, Dark: { value: "#60a5fa" } },
    },
    {
      name: "color/primary",
      collection: "Theme",
      resolvedType: "COLOR",
      resolvedValue: "#1d4ed8",
      valuesByMode: {
        Light: { value: "#1d4ed8", aliasOf: "color/blue/500" },
        Dark: { value: "#60a5fa", aliasOf: "color/blue/500" },
      },
    },
    {
      name: "spacing/4",
      collection: "Theme",
      resolvedType: "FLOAT",
      resolvedValue: "4",
      valuesByMode: { Light: { value: "4" }, Dark: { value: "4" } },
    },
    {
      name: "radius/md",
      collection: "Theme",
      resolvedType: "FLOAT",
      resolvedValue: "8",
      valuesByMode: { Light: { value: "8" }, Dark: { value: "8" } },
    },
  ],
};

function result(over: Partial<ExecResult> = {}): ExecResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, ...over };
}

/** A figma-cli that is installed, connected in yolo mode, and answers the variables read. */
function fakeFigmaCli(): void {
  mocked.mockImplementation(async (_command: string, args: string[]) => {
    const cli = args.slice(1); // args[0] is the CLI entry point
    if (cli[0] === "daemon") return result({ stdout: "Daemon running in Yolo Mode (CDP)" });
    if (cli[0] === "files") return result({ stdout: '[{"name":"Design System"}]' });
    if (cli[0] === "eval") return result({ stdout: JSON.stringify(MODEL) });
    return result({ code: 1, stderr: `unexpected figma-cli call: ${cli.join(" ")}` });
  });
}

/** Every design-source request made so far. figma-cli is reached only through `execFileSafe`. */
function designSourceCalls(): number {
  return mocked.mock.calls.length;
}

/**
 * How many times the design source's TOKENS were actually read — the `eval` that runs the variables
 * fetch, plus the `export dtcg` fallback.
 *
 * Counted separately from `designSourceCalls` because a connection handshake is not a token scan:
 * the claim in task 7.9 is that the tokens are read once, and a test that only watched the total
 * would pass just as happily if the handshake were the thing being repeated.
 */
function variableReads(): number {
  return mocked.mock.calls.filter(([, args]) => {
    const cli = (args as string[]).slice(1);
    return cli[0] === "eval" || (cli[0] === "export" && cli[1] === "dtcg");
  }).length;
}

async function project(options: { styling: string; tokenFile: string }): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await writeFile(
    join(dir, ".sdd-de", "project.yaml"),
    [
      "framework: react",
      "language: typescript",
      `styling: ${options.styling}`,
      `token_file: ${options.tokenFile}`,
      "component_dir: src/components",
      "",
    ].join("\n"),
    "utf8",
  );
}

/**
 * Where each supported styling approach writes, and what proves the emit really landed.
 *
 * Each approach gets its OWN `token_file` so every emit is a real write. Sharing a path between
 * approaches that emit the same format (css / css-modules, styled-components / emotion) would make
 * the second one report `up-to-date` — correct behaviour per task 7.8's idempotence, but it would
 * weaken this test into asserting nothing for half the table.
 */
const STYLINGS: { styling: string; tokenFile: string; contains: string }[] = [
  { styling: "css", tokenFile: "src/styles/tokens.css", contains: "--color-primary" },
  { styling: "css-modules", tokenFile: "src/styles/module-tokens.css", contains: "--color-primary" },
  { styling: "scss", tokenFile: "src/styles/_tokens.scss", contains: "$color-primary" },
  { styling: "styled-components", tokenFile: "src/theme/sc-tokens.ts", contains: "export const" },
  { styling: "emotion", tokenFile: "src/theme/emotion-tokens.ts", contains: "export const" },
  { styling: "tailwind", tokenFile: "src/styles/theme.css", contains: "@theme" },
];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-one-scan-"));
  hoisted.userData = join(dir, "userData");
  // `isInstalled()` is a real existsSync on the CLI entry point, so give it a real (empty) file.
  cliDir = join(dir, "figma-cli");
  await mkdir(join(cliDir, "src"), { recursive: true });
  await writeFile(join(cliDir, "src", "index.js"), "// fake figma-cli\n", "utf8");
  previousCliDir = process.env.VORTSPEC_FIGMA_CLI_DIR;
  process.env.VORTSPEC_FIGMA_CLI_DIR = cliDir;
  mocked.mockReset();
  fakeFigmaCli();
});

afterEach(async () => {
  if (previousCliDir === undefined) delete process.env.VORTSPEC_FIGMA_CLI_DIR;
  else process.env.VORTSPEC_FIGMA_CLI_DIR = previousCliDir;
  await rm(dir, { recursive: true, force: true });
});

describe("one scan, many emits (task 7.9)", () => {
  it("reads the design source once, then emits every supported styling with no further reads", async () => {
    await project(STYLINGS[0]);
    const sync = await syncVariablesToCache(dir);
    expect(sync.ok).toBe(true);
    // The sync emits on its own tail now (task 7.14), so the project's configured styling — css —
    // already has its token file before the loop below reaches it.
    expect(sync.emit?.status).toBe("written");

    const afterScan = designSourceCalls();
    expect(afterScan).toBeGreaterThan(0); // the scan really did talk to figma-cli
    expect(variableReads()).toBe(1); // and read the tokens exactly once

    // Every supported approach emits from the SAME canonical artifact the single scan produced.
    const emitted: string[] = [];
    for (const target of STYLINGS) {
      await project(target);
      const emit = await emitTokenFiles(dir);
      // css is the styling the sync already emitted for, so re-emitting it is the idempotence path;
      // every other styling is a fresh write. Both prove the same thing — no second design-source read.
      const expected = target.styling === STYLINGS[0].styling ? "up-to-date" : "written";
      expect(emit.status, `${target.styling} should emit`).toBe(expected);
      const content = await readFile(join(dir, target.tokenFile), "utf8");
      expect(content, `${target.styling} emit should carry the scanned tokens`).toContain(
        target.contains,
      );
      emitted.push(target.styling);
    }

    // Coverage is asserted, not assumed: if a new styling approach gains an emitter and this table
    // is not extended, the test fails rather than quietly proving one-scan-many-emits over fewer
    // formats than the project actually supports.
    expect([...new Set(emitted)].sort()).toEqual([...SUPPORTED_STYLING_APPROACHES].sort());

    // The whole point: N emits, still exactly the one scan.
    expect(variableReads()).toBe(1);
    expect(designSourceCalls()).toBe(afterScan);
  });

  it("makes no design-source request at all when the project switches styling", async () => {
    await project({ styling: "css", tokenFile: "src/styles/tokens.css" });
    await syncVariablesToCache(dir);
    await emitTokenFiles(dir);

    const canonical = join(dir, CANONICAL_TOKENS_PATH);
    const before = await readFile(canonical, "utf8");
    const beforeMtime = (await stat(canonical)).mtimeMs;

    // From here on, a single call to figma-cli is a failure — not merely a slow path.
    mocked.mockReset();
    mocked.mockImplementation(async () => {
      throw new Error("the emit path must never reach the design source");
    });

    await project({ styling: "tailwind", tokenFile: "src/styles/theme.css" });
    const emit = await emitTokenFiles(dir);

    expect(emit.status).toBe("written");
    expect(emit.format).toBe("tailwind-v4");
    expect(designSourceCalls()).toBe(0);
    // The switch is a pure re-projection: the canonical artifact is read, never rewritten.
    expect(await readFile(canonical, "utf8")).toBe(before);
    expect((await stat(canonical)).mtimeMs).toBe(beforeMtime);
  });

  it("emits a Tailwind v3 project from the same scan, without re-reading the source", async () => {
    await project({ styling: "tailwind", tokenFile: "tailwind.config.js" });
    await syncVariablesToCache(dir);
    const afterScan = designSourceCalls();

    const emit = await emitTokenFiles(dir, { tailwindVersion: 3 });

    expect(emit.format).toBe("tailwind-v3");
    // v3 is two files — the config and the `:root` layer it references. Both come from one scan.
    expect(emit.written).toContain("tailwind.config.js");
    expect(emit.written.length).toBe(2);
    expect(designSourceCalls()).toBe(afterScan);
  });
});
