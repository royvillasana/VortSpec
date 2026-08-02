import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { sameDesignValue } from "@vortspec/core/style-values";
import { readScreenTokens } from "./screen-tokens";
import { setThemeTokenOverride } from "./theme-override-store";

/**
 * Reading the tokens a SCREEN declares. A composed light page carries its own `:root` block using the
 * design system's token names, which is what makes a screen's look comparable to the design system at all.
 *
 * What the reader produces is compared against the design system in `design-library.test.ts`; here we pin
 * the reading itself — root block vs. component-local, and how disagreeing screens are resolved.
 */

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function w(rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), content, "utf8");
}

/** An Astryx project whose token file imports the vendor theme — the real consumed-library shape. */
async function project(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vs-screen-drift-"));
  await w(
    ".sdd-de/project.yaml",
    ["design_source: library", "component_library: astryx", "token_file: src/styles/tokens.css", "theme_apply: css-vars"].join("\n"),
  );
  await w(
    "node_modules/@astryxdesign/theme-neutral/package.json",
    JSON.stringify({ name: "@astryxdesign/theme-neutral", exports: { "./theme.css": "./dist/theme.css" } }),
  );
  await w(
    "node_modules/@astryxdesign/theme-neutral/dist/theme.css",
    [
      ":root {",
      "  --color-accent: light-dark(#262626, #ebebeb);",
      "  --radius-container: 0.75rem;",
      "  --color-border: light-dark(#00000014, #FFFFFF1A);",
      "}",
      "",
    ].join("\n"),
  );
  await w("src/styles/tokens.css", "@import '@astryxdesign/theme-neutral/theme.css';\n");
  return dir;
}

function page(tokens: string, body = "<div>hi</div>"): string {
  return `<html><head><style>\n  :root {\n${tokens}\n  }\n  .btn { --color-accent: #ff0000; }\n</style></head><body>${body}</body></html>`;
}

describe("readScreenTokens", () => {
  it("reads each screen's root token block and ignores component-local redeclarations", async () => {
    const p = await project();
    await w(".vortspec/light-pages/shopdev.html", page("    --color-accent: #5433eb;\n    --radius-card: 20px;"));

    const { screens, tokens } = await readScreenTokens(p);
    expect(screens).toEqual(["shopdev"]);
    // `.btn { --color-accent: #ff0000 }` is that component's local tweak, not the page's token choice.
    expect(tokens.get("color-accent")).toEqual({ value: "#5433eb", screens: ["shopdev"] });
    expect(tokens.get("radius-card")).toEqual({ value: "20px", screens: ["shopdev"] });
  });

  it("lets the majority of screens win a disagreement, and reports the dissenters", async () => {
    const p = await project();
    await w(".vortspec/light-pages/a.html", page("    --color-accent: #5433eb;"));
    await w(".vortspec/light-pages/b.html", page("    --color-accent: #5433eb;"));
    await w(".vortspec/light-pages/c.html", page("    --color-accent: #00aa00;"));

    const { tokens } = await readScreenTokens(p);
    expect(tokens.get("color-accent")).toEqual({
      value: "#5433eb",
      screens: ["a", "b"],
      conflicts: [{ screen: "c", value: "#00aa00" }],
    });
  });

  it("returns nothing when the project has no screens", async () => {
    const p = await project();
    expect(await readScreenTokens(p)).toEqual({ screens: [], tokens: new Map() });
  });
});

describe("sameDesignValue", () => {
  it("treats equivalent spellings as equal so the user isn't nagged about nothing", () => {
    expect(sameDesignValue("0.75rem", "12px")).toBe(true);
    expect(sameDesignValue("#FFF", "#ffffff")).toBe(true);
    expect(sameDesignValue("#ffffffff", "#ffffff")).toBe(true);
    // A light page states light mode; compare against the light half of the pair.
    expect(sameDesignValue("light-dark(#5433eb, #ebebeb)", "#5433eb")).toBe(true);
    expect(sameDesignValue("light-dark(#262626, #ebebeb)", "#5433eb")).toBe(false);
    expect(sameDesignValue("12px", "16px")).toBe(false);
  });
});
