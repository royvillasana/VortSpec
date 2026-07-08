import { join, dirname, basename } from "node:path";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { readProjectConfig } from "../workspace/config-manager";
import { detectedComponentsSchema, type DetectedComponent } from "@vortspec/core/flow";
import type {
  ComponentStatus,
  FileSnapshot,
  InspectorComponent,
  InspectorComponentsResult,
  PropControl,
} from "@vortspec/core/inspector";

/**
 * Read the design system's components from the project's own files — the
 * `.sdd-de/components.json` inventory plus the generated source under
 * `component_dir`. Props are derived from the source (CVA variants), tokens are
 * scanned from it, and status comes from the visual-verify report. No IR store.
 */

const SOURCE_EXTS = [".tsx", ".jsx", ".vue", ".svelte", ".ts"];

/** Return the body inside the first `{...}` at/after `from`, brace-balanced. */
function balanced(src: string, from: number): { body: string; end: number } | null {
  const open = src.indexOf("{", from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return { body: src.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Blank out string literals so their contents (which contain `:`) aren't parsed as keys. */
function stripStrings(s: string): string {
  return s
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/** Parse CVA `variants` groups + `defaultVariants` from component/variants source. */
export function parseProps(src: string): PropControl[] {
  const vIdx = src.search(/\bvariants\s*:/);
  if (vIdx < 0) return [];
  const vb = balanced(src, vIdx);
  if (!vb) return [];

  const defaults = new Map<string, string>();
  const dIdx = src.search(/\bdefaultVariants\s*:/);
  if (dIdx >= 0) {
    const db = balanced(src, dIdx);
    if (db) {
      for (const m of stripStrings(db.body).matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) {
        // Recover the real (un-stripped) value for this key.
        const valMatch = db.body.match(
          new RegExp(`${m[1]}\\s*:\\s*['"]([^'"]+)['"]`),
        );
        if (valMatch) defaults.set(m[1], valMatch[1]);
      }
    }
  }

  const props: PropControl[] = [];
  // Each variant group is `key: { ...flat option keys... }` (no nested braces).
  for (const m of vb.body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*)\}/g)) {
    const key = m[1];
    const options: string[] = [];
    for (const om of stripStrings(m[2]).matchAll(
      /(['"]?)([A-Za-z_$][\w$-]*|true|false)\1\s*:/g,
    )) {
      options.push(om[2]);
    }
    if (options.length === 0) continue;
    const isBool = options.every((o) => o === "true" || o === "false");
    props.push({
      key,
      kind: isBool ? "boolean" : "enum",
      options,
      defaultValue: defaults.get(key),
    });
  }
  return props;
}

/**
 * Locate the `<stem>.variants.ts` sibling for a component file, matching the stem
 * case-insensitively (Button.tsx ↔ button.variants.ts). Returns a project-relative path.
 */
async function variantsSibling(projectPath: string, file: string): Promise<string | null> {
  const dir = dirname(file);
  const stem = basename(file)
    .replace(/\.(tsx|jsx|ts)$/, "")
    .toLowerCase();
  const entries = await readdir(join(projectPath, dir)).catch(() => [] as string[]);
  const hit = entries.find(
    (n) => n.endsWith(".variants.ts") && n.slice(0, -".variants.ts".length).toLowerCase() === stem,
  );
  return hit ? join(dir, hit) : null;
}

async function findSourceFile(dir: string, name: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findSourceFile(full, name);
      if (found) return found;
    } else if (SOURCE_EXTS.some((ext) => entry.name === `${name}${ext}`)) {
      return full;
    }
  }
  return null;
}

function scanTokens(...sources: string[]): string[] {
  const found = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/var\(\s*--([\w-]+)/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/** First existing path among candidates (project-relative), or null. */
async function firstExisting(projectPath: string, rels: string[]): Promise<string | null> {
  for (const rel of rels) {
    try {
      await readFile(join(projectPath, rel), "utf8");
      return rel;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function componentStatus(
  projectPath: string,
  name: string,
  hasFile: boolean,
): Promise<{ status: ComponentStatus; issues: string[]; specPath: string | null; reportPath: string | null }> {
  const slug = name.toLowerCase();
  const specPath = await firstExisting(projectPath, [
    join("specs", slug, "spec.md"),
    join("specs", slug, `${slug}.md`),
    join("specs", slug, "README.md"),
  ]);
  const reportPath = await firstExisting(projectPath, [
    join("specs", slug, "visual-verify-report.md"),
  ]);
  if (!hasFile) return { status: "unknown", issues: [], specPath, reportPath };
  let report: string;
  try {
    report = reportPath ? await readFile(join(projectPath, reportPath), "utf8") : "";
    if (!reportPath) return { status: "built", issues: [], specPath, reportPath };
  } catch {
    return { status: "built", issues: [], specPath, reportPath };
  }
  const hasOpen = /status:\s*open/i.test(report) || /open (discrepanc|source-level)/i.test(report);
  if (hasOpen) {
    const issues = [...report.matchAll(/^###\s+(D\d[^\n]*)/gm)].map((m) => m[1].trim());
    return { status: "has-issues", issues, specPath, reportPath };
  }
  return { status: "verified", issues: [], specPath, reportPath };
}

export async function getInspectorComponents(
  projectPath: string,
): Promise<InspectorComponentsResult> {
  const config = await readProjectConfig(projectPath);
  const componentDir = config?.componentDir ?? null;
  let manifest: DetectedComponent[] = [];
  try {
    const raw = await readFile(join(projectPath, ".sdd-de/components.json"), "utf8");
    const parsed = detectedComponentsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) manifest = parsed.data;
  } catch {
    /* no manifest → empty inventory */
  }

  const root = componentDir ? join(projectPath, componentDir) : projectPath;
  const components: InspectorComponent[] = [];
  for (const entry of manifest) {
    const abs = await findSourceFile(root, entry.name);
    const file = abs ? abs.slice(projectPath.length + 1) : null;
    let props: PropControl[] = [];
    let tokens: string[] = [];
    if (abs && file) {
      const src = await readFile(abs, "utf8").catch(() => "");
      // CVA variants usually live in a sibling `<name>.variants.ts`.
      const vrel = await variantsSibling(projectPath, file);
      const variantsSrc = vrel ? await readFile(join(projectPath, vrel), "utf8").catch(() => "") : "";
      props = parseProps(variantsSrc || src);
      tokens = scanTokens(src, variantsSrc);
    }
    const { status, issues, specPath, reportPath } = await componentStatus(
      projectPath,
      entry.name,
      Boolean(abs),
    );
    components.push({
      name: entry.name,
      level: entry.level,
      description: entry.description,
      file,
      props,
      tokens,
      status,
      issues,
      specPath,
      reportPath,
    });
  }

  return { componentDir, previewUrl: null, components };
}

/**
 * Capture a component's source (its file + a `.variants.ts` sibling) before a
 * gated modify run, so the change can be reverted if the user rejects it.
 */
export async function snapshotComponent(
  projectPath: string,
  file: string,
): Promise<FileSnapshot[]> {
  const vrel = await variantsSibling(projectPath, file);
  const candidates = [file, ...(vrel ? [vrel] : [])];
  const snaps: FileSnapshot[] = [];
  for (const rel of candidates) {
    const content = await readFile(join(projectPath, rel), "utf8").catch(() => null);
    if (content !== null) snaps.push({ path: rel, content });
  }
  return snaps;
}

/** Restore captured files verbatim (revert a rejected modify run). */
export async function restoreFiles(projectPath: string, files: FileSnapshot[]): Promise<void> {
  for (const f of files) {
    await writeFile(join(projectPath, f.path), f.content, "utf8").catch(() => undefined);
  }
}
