import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CANONICAL_TOKENS_PATH, readDocumentExtension } from "@vortspec/core/design-tokens";
import { validateCanonicalTokens } from "@vortspec/core/canonical-tokens";
import { ingestMessage, ingestTokensFromProject } from "./token-ingest";
import { readCanonicalTokens } from "./canonical-tokens";
import { emitTokenFiles } from "./token-emit";

/**
 * The non-design-tool ingest, end to end — OpenSpec change: agentic-design-system, task 7.10.
 *
 * The pure shape decisions are covered in `shared/canonical-ingest.test.ts`. What is tested HERE is
 * what only the fs half can get wrong: routing by file format, following a consumed library's
 * `@import` chain, and — the assertion the task names — that a consumed source is never written.
 */

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vortspec-token-ingest-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

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
      `styling: ${options.styling ?? "css"}`,
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

/** Every file under the project except VortSpec's own state — what an ingest must leave untouched. */
async function sourceFiles(): Promise<{ path: string; content: string; mtimeMs: number }[]> {
  const out: { path: string; content: string; mtimeMs: number }[] = [];
  async function walk(rel: string): Promise<void> {
    for (const entry of await readdir(join(dir, rel), { withFileTypes: true })) {
      if (entry.name === ".vortspec") continue;
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

describe("ingesting a stylesheet as the design source (task 7.10)", () => {
  it("writes the canonical artifact in the same DTCG form a Figma read produces", async () => {
    await project({ tokenFile: "src/styles/tokens.css" });
    await write(
      "src/styles/tokens.css",
      ":root {\n  --color-primary: #1d4ed8;\n  --spacing-4: 1rem;\n}\n.dark {\n  --color-primary: #60a5fa;\n}\n",
    );

    const result = await ingestTokensFromProject(dir, { generatedAt: "2026-08-07T10:00:00.000Z" });

    expect(result.ok).toBe(true);
    expect(result.format).toBe("css");
    expect(result.count).toBe(2);
    expect(result.dropped).toEqual([]);

    const document = await readCanonicalTokens(dir);
    expect(document).not.toBeNull();
    expect(validateCanonicalTokens(document).violations).toEqual([]);
    const ext = readDocumentExtension(document!);
    expect(ext?.source).toBe("css");
    expect(ext?.generatedAt).toBe("2026-08-07T10:00:00.000Z");
    expect(ext?.collections?.[0]?.modes).toEqual(["Default", "Dark"]);
  });

  it("follows the @import chain, which is the only way a consumed theme has any tokens at all", async () => {
    await project({ tokenFile: "src/styles/tokens.css" });
    // The shape a consumed library really has: the entry declares an override and imports the theme.
    await write("src/styles/tokens.css", `@import "./vendor-theme.css";\n:root {\n  --color-primary: #111;\n}\n`);
    await write("src/styles/vendor-theme.css", ":root {\n  --color-primary: #1d4ed8;\n  --radius-md: 8px;\n}\n");

    const result = await ingestTokensFromProject(dir);

    expect(result.count).toBe(2);
    expect(result.files).toContain("src/styles/vendor-theme.css");
    const document = await readCanonicalTokens(dir);
    // The importing file wins, exactly as the cascade would resolve it.
    expect((document as Record<string, { $value: string }>)["color-primary"].$value).toBe("#111");
  });

  it("routes a .scss token file to the SCSS reader", async () => {
    await project({ tokenFile: "src/styles/_tokens.scss", styling: "scss" });
    await write("src/styles/_tokens.scss", "$color-primary: #1d4ed8;\n$color-brand: $color-primary;\n");

    const result = await ingestTokensFromProject(dir);

    expect(result.format).toBe("scss");
    expect(result.count).toBe(2);
    const document = (await readCanonicalTokens(dir)) as Record<string, { $value: string }>;
    expect(document["color-brand"].$value).toBe("{color-primary}");
  });

  it("routes a .ts theme file through the parser, never through evaluation", async () => {
    await project({ tokenFile: "src/theme/tokens.ts", styling: "styled-components" });
    await write(
      "src/theme/tokens.ts",
      `export const theme = { color: { primary: "#1d4ed8" }, radius: { md: "8px" } } as const;\n`,
    );

    const result = await ingestTokensFromProject(dir);

    expect(result.format).toBe("ts");
    expect(result.count).toBe(2);
    const document = await readCanonicalTokens(dir);
    expect(validateCanonicalTokens(document).violations).toEqual([]);
  });

  it("adopts a JSON file that is already DTCG rather than re-deriving it", async () => {
    await project({ tokenFile: "tokens.json" });
    await write(
      "tokens.json",
      JSON.stringify({ color: { primary: { $type: "color", $value: "#1d4ed8", $description: "brand" } } }),
    );

    const result = await ingestTokensFromProject(dir);

    expect(result.format).toBe("dtcg");
    const document = await readCanonicalTokens(dir);
    const leaf = (document as Record<string, Record<string, Record<string, string>>>).color.primary;
    // The file's own type and description survive — better information than anything inferred.
    expect(leaf.$description).toBe("brand");
    expect(leaf.$type).toBe("color");
  });

  it("reads a plain JSON theme object as a tree", async () => {
    await project({ tokenFile: "tokens.json" });
    await write("tokens.json", JSON.stringify({ color: { blue: { 500: "#1d4ed8" } } }));

    const result = await ingestTokensFromProject(dir);

    expect(result.format).toBe("json");
    expect(result.count).toBe(1);
  });

  it("reports rather than throws when there is nothing to read", async () => {
    await project({ tokenFile: "src/styles/missing.css" });
    const result = await ingestTokensFromProject(dir);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("src/styles/missing.css");
  });
});

describe("a consumed design system is projected, never owned (task 7.10)", () => {
  async function consumeProject(): Promise<{ path: string; content: string; mtimeMs: number }[]> {
    await project({ tokenFile: "node_modules/@vendor/theme/theme.css", designSource: "library" });
    await write(
      "node_modules/@vendor/theme/theme.css",
      ":root {\n  --color-primary: #1d4ed8;\n  --radius-md: 8px;\n}\n",
    );
    return sourceFiles();
  }

  it("derives the artifact from the consumed source and writes nothing else", async () => {
    const before = await consumeProject();

    const result = await ingestTokensFromProject(dir);

    expect(result.ok).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.count).toBe(2);
    // The artifact exists…
    await expect(readFile(join(dir, CANONICAL_TOKENS_PATH), "utf8")).resolves.toContain("color-primary");
    // …and NOT ONE file of the consumed source changed — not its bytes, not even its mtime.
    expect(await sourceFiles()).toEqual(before);
  });

  it("labels the artifact as a consumed projection, not as the project's own stylesheet", async () => {
    await consumeProject();
    await ingestTokensFromProject(dir);
    const document = await readCanonicalTokens(dir);
    // The format is identical to an owned stylesheet's; the ORIGIN is what a reader deciding
    // whether it may write back has to be able to tell apart.
    expect(readDocumentExtension(document!)?.source).toBe("library");
  });

  it("refuses to emit over the consumed source, with no divergence prompt to override", async () => {
    const before = await consumeProject();
    await ingestTokensFromProject(dir);

    const emit = await emitTokenFiles(dir);

    expect(emit.status).toBe("read-only");
    expect(emit.written).toEqual([]);
    expect(emit.message).toContain("consumes its design system");
    expect(await sourceFiles()).toEqual(before);
  });

  it("stays read-only even when a caller answers the divergence prompt with overwrite", async () => {
    // The dangerous path: `onDivergence: "overwrite"` is exactly how a caller resolves a hand-edited
    // token file, and without the guard it would resolve "this consumed file isn't ours" by
    // destroying the vendor's design system.
    const before = await consumeProject();
    await ingestTokensFromProject(dir);

    const emit = await emitTokenFiles(dir, { onDivergence: "overwrite" });

    expect(emit.status).toBe("read-only");
    expect(await sourceFiles()).toEqual(before);
  });
});

describe("ingestMessage", () => {
  it("names dropped tokens, capped, because the fix needs the name", () => {
    const message = ingestMessage({
      count: 3,
      tokenFile: "src/styles/tokens.css",
      format: "css",
      dropped: ["a", "b", "c", "d", "e", "f", "g"],
      readOnly: false,
    });
    expect(message).toContain("Read 3 design tokens");
    expect(message).toContain("a, b, c, d, e");
    expect(message).toContain("+2 more");
  });

  it("says a consumed source is never written", () => {
    const message = ingestMessage({
      count: 1,
      tokenFile: "node_modules/@vendor/theme/theme.css",
      format: "css",
      dropped: [],
      readOnly: true,
    });
    expect(message).toContain("read-only");
  });
});
