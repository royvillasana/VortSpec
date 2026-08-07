import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOKEN_EMIT_LEDGER_PATH } from "@vortspec/core/token-emit-ledger";
import type { DesignTokenDocument } from "@vortspec/core/design-tokens";
import { emitTokenFiles } from "./token-emit";
import { writeCanonicalTokens } from "./canonical-tokens";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-token-emit-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A canonical artifact small enough to read in a failure message, wide enough to exercise aliases. */
function doc(primary = "#1D4ED8"): DesignTokenDocument {
  return {
    primitive: {
      color: { blue: { $type: "color", "500": { $value: primary } } },
      spacing: { $type: "dimension", "4": { $value: 4 }, "8": { $value: 8 } },
    },
    theme: {
      color: { primary: { $type: "color", $value: "{primitive.color.blue.500}" } },
    },
  } as unknown as DesignTokenDocument;
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

describe("emitting the token file from the canonical artifact (task 7.8)", () => {
  it("writes the token file the project's styling asks for, at the configured path", async () => {
    await project({ styling: "css", tokenFile: "src/styles/tokens.css" });
    await writeCanonicalTokens(dir, doc());

    const result = await emitTokenFiles(dir);

    expect(result.status).toBe("written");
    expect(result.format).toBe("css");
    expect(result.written).toEqual(["src/styles/tokens.css"]);
    const content = await readFile(join(dir, "src/styles/tokens.css"), "utf8");
    expect(content).toContain("--theme-color-primary");
  });

  it("re-emits byte-identically with no canonical change, and does not touch the file at all", async () => {
    await project({ styling: "css", tokenFile: "src/styles/tokens.css" });
    await writeCanonicalTokens(dir, doc());
    await emitTokenFiles(dir);

    const path = join(dir, "src/styles/tokens.css");
    const first = await readFile(path, "utf8");
    const firstMtime = (await stat(path)).mtimeMs;

    const second = await emitTokenFiles(dir);

    expect(second.status).toBe("up-to-date");
    expect(second.written).toEqual([]);
    expect(await readFile(path, "utf8")).toBe(first);
    // Not merely equal bytes — the file was never rewritten, so a watcher sees nothing either.
    expect((await stat(path)).mtimeMs).toBe(firstMtime);
  });

  it("emits byte-identical bytes for the same canonical artifact across every format it supports", async () => {
    for (const styling of ["css", "scss", "tailwind", "styled-components"]) {
      const extension = { css: "css", scss: "scss", tailwind: "css", "styled-components": "ts" }[styling];
      const tokenFile = `src/styles/tokens.${extension}`;
      await project({ styling, tokenFile });
      await writeCanonicalTokens(dir, doc());
      await rm(join(dir, TOKEN_EMIT_LEDGER_PATH), { force: true });
      await rm(join(dir, tokenFile), { force: true });

      await emitTokenFiles(dir);
      const first = await readFile(join(dir, tokenFile), "utf8");
      await rm(join(dir, TOKEN_EMIT_LEDGER_PATH), { force: true });
      await rm(join(dir, tokenFile), { force: true });
      await emitTokenFiles(dir);

      expect(await readFile(join(dir, tokenFile), "utf8")).toBe(first);
    }
  });

  it("rewrites the token file when the canonical artifact changes", async () => {
    await project({ styling: "css", tokenFile: "src/styles/tokens.css" });
    await writeCanonicalTokens(dir, doc());
    await emitTokenFiles(dir);

    await writeCanonicalTokens(dir, doc("#B91C1C"));
    const result = await emitTokenFiles(dir);

    expect(result.status).toBe("written");
    expect(await readFile(join(dir, "src/styles/tokens.css"), "utf8")).toContain("#B91C1C");
  });

  it("writes the Tailwind v3 companion custom-properties file beside the config", async () => {
    await project({ styling: "tailwind", tokenFile: "tailwind.config.js" });
    await writeCanonicalTokens(dir, doc());

    const result = await emitTokenFiles(dir, { tailwindVersion: 3 });

    expect(result.written).toEqual(["tailwind.config.js", "tokens.css"]);
    expect(await readFile(join(dir, "tokens.css"), "utf8")).toContain("--theme-color-primary");
  });
});

describe("a hand-edited token file (task 7.8)", () => {
  async function emitThenHandEdit(): Promise<void> {
    await project({ styling: "css", tokenFile: "src/styles/tokens.css" });
    await writeCanonicalTokens(dir, doc());
    await emitTokenFiles(dir);
    const path = join(dir, "src/styles/tokens.css");
    await writeFile(path, `${await readFile(path, "utf8")}\n:root { --brand-hand-tuned: #ff0000; }\n`, "utf8");
    await writeCanonicalTokens(dir, doc("#B91C1C"));
  }

  it("reports the divergence and writes nothing", async () => {
    await emitThenHandEdit();

    const result = await emitTokenFiles(dir);

    expect(result.status).toBe("diverged");
    expect(result.diverged).toEqual(["src/styles/tokens.css"]);
    expect(result.message).toContain("src/styles/tokens.css");
    // The hand edit is still there, and the new canonical value never landed.
    const content = await readFile(join(dir, "src/styles/tokens.css"), "utf8");
    expect(content).toContain("--brand-hand-tuned");
    expect(content).not.toContain("#B91C1C");
  });

  it("overwrites only on an explicit choice", async () => {
    await emitThenHandEdit();

    const result = await emitTokenFiles(dir, { onDivergence: "overwrite" });

    expect(result.status).toBe("written");
    const content = await readFile(join(dir, "src/styles/tokens.css"), "utf8");
    expect(content).toContain("#B91C1C");
    expect(content).not.toContain("--brand-hand-tuned");
  });

  it("keeps the hand edits on the other choice — and still reports them on the next run", async () => {
    await emitThenHandEdit();

    const kept = await emitTokenFiles(dir, { onDivergence: "keep" });
    expect(kept.kept).toEqual(["src/styles/tokens.css"]);
    expect(await readFile(join(dir, "src/styles/tokens.css"), "utf8")).toContain("--brand-hand-tuned");

    // The failure this exists to prevent: a `keep` must NOT quietly adopt the file, or the very
    // next emit would delete the hand-tuned theme without asking.
    expect((await emitTokenFiles(dir)).status).toBe("diverged");
    expect(await readFile(join(dir, "src/styles/tokens.css"), "utf8")).toContain("--brand-hand-tuned");
  });

  it("refuses to adopt a pre-existing token file it never wrote", async () => {
    await project({ styling: "css", tokenFile: "src/styles/tokens.css" });
    await writeCanonicalTokens(dir, doc());
    await mkdir(join(dir, "src/styles"), { recursive: true });
    await writeFile(join(dir, "src/styles/tokens.css"), ":root { --hand-authored: 1; }\n", "utf8");

    const result = await emitTokenFiles(dir);

    expect(result.status).toBe("diverged");
    expect(await readFile(join(dir, "src/styles/tokens.css"), "utf8")).toContain("--hand-authored");
  });
});

describe("what emission refuses to guess", () => {
  it("throws when the project has no config", async () => {
    await expect(emitTokenFiles(dir)).rejects.toThrow(/project\.yaml/);
  });

  it("throws when there is no canonical artifact to derive from", async () => {
    await project({ styling: "css", tokenFile: "src/styles/tokens.css" });
    await expect(emitTokenFiles(dir)).rejects.toThrow(/tokens\.json/);
  });

  it("throws, naming the approach, when the styling has no emitter (task 7.7)", async () => {
    await project({ styling: "vanilla-extract", tokenFile: "src/styles/tokens.css.ts" });
    await writeCanonicalTokens(dir, doc());
    await expect(emitTokenFiles(dir)).rejects.toThrow(/vanilla-extract/);
    // And nothing was written in a format the project cannot consume.
    await expect(readFile(join(dir, "src/styles/tokens.css.ts"), "utf8")).rejects.toThrow();
  });
});
