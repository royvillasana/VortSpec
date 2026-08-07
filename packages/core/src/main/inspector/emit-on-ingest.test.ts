import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExecResult } from "../util/exec";
import { TOKEN_EMIT_LEDGER_PATH } from "@vortspec/core/token-emit-ledger";

/**
 * Emission runs at the end of every ingest — OpenSpec change: agentic-design-system, task 7.14.
 *
 * Before this, `emitTokenFiles` and `ingestTokensFromProject` had NO callers: the pipeline was built
 * and tested but nothing invoked it, so "the token file is a derived artifact" was true only in
 * principle. Worse, anything that DID write the token file by hand — which is what `/sync-tokens`
 * still instructs — would leave it diverged from a ledger no emit had ever written.
 *
 * The acceptance test the task names is the last one here: after a Figma sync, a second emit reports
 * `up-to-date` and never `diverged`.
 */

const hoisted = vi.hoisted(() => ({ userData: "" }));
vi.mock("electron", () => ({
  app: { getName: () => "VortSpec", getPath: () => hoisted.userData },
}));
vi.mock("../util/exec", () => ({ execFileSafe: vi.fn() }));

import { execFileSafe } from "../util/exec";
import { syncVariablesToCache } from "../figma/figma-cli";
import { ingestTokensFromProject } from "./token-ingest";
import { emitTokenFiles } from "./token-emit";

const mocked = vi.mocked(execFileSafe);

let dir = "";
let previousCliDir: string | undefined;

const MODEL = {
  collections: [{ name: "Theme", modes: [{ id: "m1", name: "Light" }], defaultModeId: "m1" }],
  variables: [
    {
      name: "color/primary",
      collection: "Theme",
      resolvedType: "COLOR",
      resolvedValue: "#1d4ed8",
      valuesByMode: { Light: { value: "#1d4ed8" } },
    },
    {
      name: "spacing/4",
      collection: "Theme",
      resolvedType: "FLOAT",
      resolvedValue: "16",
      valuesByMode: { Light: { value: "16" } },
    },
  ],
};

function result(over: Partial<ExecResult> = {}): ExecResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, ...over };
}

function fakeFigmaCli(): void {
  mocked.mockImplementation(async (_command: string, args: string[]) => {
    const cli = args.slice(1);
    if (cli[0] === "daemon") return result({ stdout: "Daemon running in Yolo Mode (CDP)" });
    if (cli[0] === "files") return result({ stdout: '[{"name":"Design System"}]' });
    if (cli[0] === "eval") return result({ stdout: JSON.stringify(MODEL) });
    return result({ code: 1, stderr: `unexpected: ${cli.join(" ")}` });
  });
}

async function project(options: {
  tokenFile: string;
  styling?: string;
  designSource?: string;
}): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await writeFile(
    join(dir, ".sdd-de", "project.yaml"),
    [
      "framework: react",
      "language: typescript",
      ...(options.styling === undefined ? [] : [`styling: ${options.styling}`]),
      `token_file: ${options.tokenFile}`,
      "component_dir: src/components",
      ...(options.designSource ? [`design_source: ${options.designSource}`] : []),
      "",
    ].join("\n"),
    "utf8",
  );
}

async function write(rel: string, content: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** Every file except VortSpec's own state — what a consumed-source ingest must leave untouched. */
async function sourceFiles(): Promise<{ path: string; content: string; mtimeMs: number }[]> {
  const out: { path: string; content: string; mtimeMs: number }[] = [];
  async function walk(rel: string): Promise<void> {
    for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
      if (entry.name === ".vortspec" || entry.name === "figma-cli") continue;
      const here = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(here);
      else
        out.push({
          path: here,
          content: await readFile(join(dir, here), "utf8"),
          mtimeMs: (await stat(join(dir, here))).mtimeMs,
        });
    }
  }
  await walk("");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-emit-on-ingest-"));
  hoisted.userData = join(dir, "userData");
  const cliDir = join(dir, "figma-cli");
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

describe("a Figma sync emits the token file (task 7.14)", () => {
  it("writes token_file as part of the sync, with no separate call", async () => {
    await project({ tokenFile: "src/styles/tokens.css", styling: "css" });

    const sync = await syncVariablesToCache(dir);

    expect(sync.ok).toBe(true);
    expect(sync.emit?.status).toBe("written");
    expect(sync.emit?.written).toEqual(["src/styles/tokens.css"]);
    // The file is really there — the point of the whole task.
    expect(await readFile(join(dir, "src/styles/tokens.css"), "utf8")).toContain("--color-primary");
  });

  it("leaves token_file matching its ledger — a second emit is up-to-date, never diverged", async () => {
    // THE acceptance criterion. If the sync wrote the token file without recording the ledger, the
    // very next emit would report a divergence for a file the user never touched — the failure mode
    // that makes the divergence guard noise and gets it clicked through.
    await project({ tokenFile: "src/styles/tokens.css", styling: "css" });
    await syncVariablesToCache(dir);

    const second = await emitTokenFiles(dir);

    expect(second.status).toBe("up-to-date");
    expect(second.diverged).toEqual([]);
    await expect(readFile(join(dir, TOKEN_EMIT_LEDGER_PATH), "utf8")).resolves.toContain(
      "src/styles/tokens.css",
    );
  });

  it("re-syncing an unchanged design system rewrites nothing", async () => {
    await project({ tokenFile: "src/styles/tokens.css", styling: "css" });
    await syncVariablesToCache(dir);
    const path = join(dir, "src/styles/tokens.css");
    const mtime = (await stat(path)).mtimeMs;

    const again = await syncVariablesToCache(dir);

    expect(again.emit?.status).toBe("up-to-date");
    expect(again.emit?.written).toEqual([]);
    expect((await stat(path)).mtimeMs).toBe(mtime); // never even opened for writing
  });

  it("still succeeds — and says why — when the project cannot emit yet", async () => {
    // No `styling`, so no emitter. The READ succeeded and the artifact was written; failing the
    // whole sync over a configuration gap would throw away the expensive part.
    await project({ tokenFile: "src/styles/tokens.css", styling: undefined });

    const sync = await syncVariablesToCache(dir);

    expect(sync.ok).toBe(true);
    expect(sync.count).toBe(2);
    expect(sync.emit?.status).toBe("skipped");
    // Not silent: the reason rides in the sentence the user actually reads.
    expect(sync.emit?.message).toContain("styling");
    expect(sync.message).toContain("styling");
  });

  it("surfaces a genuine hand edit as a divergence in the sync's own message", async () => {
    await project({ tokenFile: "src/styles/tokens.css", styling: "css" });
    await syncVariablesToCache(dir);
    // A human edits the emitted file — the ONLY way a divergence can arise once VortSpec stops
    // being the second writer.
    await write("src/styles/tokens.css", ":root { --color-primary: #ff0000; }\n");

    const again = await syncVariablesToCache(dir);

    expect(again.ok).toBe(true);
    expect(again.emit?.status).toBe("diverged");
    expect(again.emit?.diverged).toEqual(["src/styles/tokens.css"]);
    expect(again.message).toContain("src/styles/tokens.css");
    // The hand edit is still there — reported, not overwritten.
    expect(await readFile(join(dir, "src/styles/tokens.css"), "utf8")).toContain("#ff0000");
  });
});

describe("the non-design-tool ingest emits too (task 7.14)", () => {
  it("refuses to emit back over the file it just read — that file IS the design source", async () => {
    // The circularity the guard exists for. Here `token_file` is the project's own authored
    // stylesheet: the artifact is derived FROM it, so emitting over it would replace the source with
    // a projection of itself and lose its comments, ordering, and anything the emitter doesn't model.
    const authored = "// brand\n$color-primary: #1d4ed8;\n$spacing-4: 1rem;\n";
    await project({ tokenFile: "src/styles/_tokens.scss", styling: "scss" });
    await write("src/styles/_tokens.scss", authored);
    const mtime = (await stat(join(dir, "src/styles/_tokens.scss"))).mtimeMs;

    const ingest = await ingestTokensFromProject(dir);

    expect(ingest.ok).toBe(true);
    expect(ingest.count).toBe(2); // the read itself worked
    expect(ingest.emit?.status).toBe("skipped");
    expect(ingest.emit?.message).toContain("design source");
    // Byte-for-byte untouched, comment and all.
    expect(await readFile(join(dir, "src/styles/_tokens.scss"), "utf8")).toBe(authored);
    expect((await stat(join(dir, "src/styles/_tokens.scss"))).mtimeMs).toBe(mtime);
  });

  it("reports read-only for a consumed source and writes none of it", async () => {
    await project({ tokenFile: "node_modules/@vendor/theme/theme.css", designSource: "library" });
    await write("node_modules/@vendor/theme/theme.css", ":root {\n  --color-primary: #1d4ed8;\n}\n");
    const before = await sourceFiles();

    const ingest = await ingestTokensFromProject(dir);

    expect(ingest.ok).toBe(true);
    expect(ingest.emit?.status).toBe("read-only");
    expect(ingest.emit?.written).toEqual([]);
    expect(await sourceFiles()).toEqual(before);
  });
});
