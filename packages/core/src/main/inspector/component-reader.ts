import { join, dirname, basename } from "node:path";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { readProjectConfig } from "../workspace/config-manager";
import { readFigmaComponents, reconcileComponents, normComponentName } from "./figma-reconcile";
import { readComponentMap, mergeComponentEntries } from "./design-map";
import { cachedScan } from "./scan-cache";
import { inspectorComponentsResultSchema } from "@vortspec/core/inspector";
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

/** Strip `//` line and `/* *\/` block comments, but never inside string/template literals. */
export function stripComments(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      out += ch;
      i++;
      while (i < src.length && src[i] !== ch) {
        out += src[i];
        if (src[i] === "\\" && i + 1 < src.length) out += src[++i];
        i++;
      }
      out += src[i] ?? "";
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++; // land on the '/'
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Split an object/array body into its top-level `,`-separated segments, respecting
 * nested `{}`/`[]`/`()` and skipping over string/template literals (whose contents
 * may contain commas, colons, or braces). The caller passes the *inner* body — the
 * text between the outer braces.
 */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i++;
      while (i < body.length && body[i] !== ch) {
        if (body[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  const last = body.slice(start);
  if (last.trim()) parts.push(last);
  return parts;
}

/** Split a top-level `key: value` segment. Key may be an identifier, string, or `true`/`false`. */
function splitKeyValue(seg: string): { key: string; value: string } | null {
  const s = seg.trim();
  const m = s.match(/^(?:(['"])((?:[^'"\\]|\\.)*)\1|([A-Za-z_$][\w$-]*))\s*:/);
  if (!m) return null;
  return { key: m[2] ?? m[3] ?? "", value: s.slice(m[0].length).trim() };
}

/**
 * The class string carried by a variant option value: a plain string/template
 * literal, or — for `cn(...)`/`clsx(...)`/array/object values — every string
 * literal within, joined. Best-effort so live preview + variant detection still
 * work for non-trivial option expressions.
 */
function extractClasses(value: string): string {
  const v = value.trim();
  const lit = v.match(/^(['"`])([\s\S]*?)\1$/);
  if (lit) return lit[2].replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (const sm of v.matchAll(/(['"`])((?:[^'"`\\]|\\.)*)\1/g)) chunks.push(sm[2]);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

/** Parse `defaultVariants: { key: 'value', ... }` into key → value. */
function parseDefaults(src: string): Map<string, string> {
  const defaults = new Map<string, string>();
  const dIdx = src.search(/\bdefaultVariants\s*:/);
  if (dIdx < 0) return defaults;
  const db = balanced(src, dIdx);
  if (!db) return defaults;
  for (const seg of splitTopLevel(db.body)) {
    const kv = splitKeyValue(seg);
    if (!kv) continue;
    // Value is a string literal, a boolean, or a number — take its bare text.
    const lit = kv.value.match(/^(['"])((?:[^'"\\]|\\.)*)\1/);
    defaults.set(kv.key, lit ? lit[2] : kv.value.replace(/[,\s]+$/, ""));
  }
  return defaults;
}

/**
 * Parse CVA `variants` groups + `defaultVariants` from component/variants source.
 *
 * Brace-aware (not a flat regex): it walks the `variants: {...}` body into top-level
 * groups, and each group into its option entries, so option values containing nested
 * braces, `cn(...)` calls, or multi-line templates parse correctly. A sibling
 * `compoundVariants` array never leaks into the base controls (it is not inside the
 * `variants` object). Degrades gracefully — any parse failure yields best-effort /
 * empty, never a throw, and nothing is surfaced to the user.
 */
export function parseProps(rawSrc: string): PropControl[] {
  try {
    const src = stripComments(rawSrc);
    const vIdx = src.search(/\bvariants\s*:/);
    if (vIdx < 0) return [];
    const vb = balanced(src, vIdx);
    if (!vb) return [];

    const defaults = parseDefaults(src);
    const props: PropControl[] = [];

    for (const groupSeg of splitTopLevel(vb.body)) {
      const kv = splitKeyValue(groupSeg);
      if (!kv) continue;
      const groupBody = balanced(kv.value, 0); // the `{...}` of option keys after the group name
      if (!groupBody) continue;

      const options: string[] = [];
      const classes: Record<string, string> = {};
      for (const optSeg of splitTopLevel(groupBody.body)) {
        const okv = splitKeyValue(optSeg);
        if (!okv) continue;
        options.push(okv.key);
        const cls = extractClasses(okv.value);
        if (cls) classes[okv.key] = cls;
      }
      if (options.length === 0) continue;

      const isBool = options.every((o) => o === "true" || o === "false");
      props.push({
        key: kv.key,
        kind: isBool ? "boolean" : "enum",
        options,
        defaultValue: defaults.get(kv.key),
        classes,
      });
    }
    return props;
  } catch {
    return []; // never let a malformed source blow up the component read
  }
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

/** Dirs a component-file search never descends into (deps/build output). */
const FIND_SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".turbo", "coverage", ".vortspec", ".sdd-de"]);

async function findSourceFile(dir: string, name: string, budget = { n: 8000 }): Promise<string | null> {
  if (budget.n <= 0) return null;
  // Match by NORMALIZED name, not an exact kebab filename — the SDD-DE convention builds
  // `<category>/<ComponentName>.tsx` (PascalCase), so a roster entry "color-picker" lives in
  // `color-picker/ColorPicker.tsx`. Case/separator-insensitive comparison (normComponentName)
  // recognizes ColorPicker.tsx / color-picker.tsx / colorPicker.tsx alike, plus an `index`
  // file inside a folder that carries the component's name. Without this, every PascalCase-named
  // component reads as "not built" and its Build button never clears.
  const target = normComponentName(name);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  let indexInMatchingDir: string | null = null;
  for (const entry of entries) {
    if (budget.n <= 0) break;
    if (entry.name.startsWith(".") || FIND_SKIP_DIRS.has(entry.name)) continue;
    budget.n--; // bound total entries so a huge repo × a large roster can't stall
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findSourceFile(full, name, budget);
      if (found) return found;
    } else {
      const ext = SOURCE_EXTS.find((e) => entry.name.endsWith(e));
      if (!ext) continue;
      const stem = entry.name.slice(0, -ext.length);
      // A file named for the component in any case/separator style is the match.
      if (normComponentName(stem) === target) return full;
      // Fall back to an `index.*` file, but only when THIS folder carries the component name.
      if (stem === "index" && normComponentName(basename(dir)) === target) indexInMatchingDir = full;
    }
  }
  return indexInMatchingDir;
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

/**
 * Decide from a visual-verify-report whether the component still has unresolved work
 * (change: figma-visual-validation). A component is "verified" ONLY when the report shows
 * no unresolved discrepancy AND the machine-readable gate is a clean PASS: a failed/blocked
 * VISUAL/TOKEN/CODE layer, or an ISSUES/BLOCKED verdict, keeps it out of "verified" so a
 * visual mismatch is never masked as passing even when the prose never says "open". Pure so
 * the gate is unit-testable independent of the filesystem walk.
 */
export function reportUnresolved(report: string): { unresolved: boolean; issues: string[] } {
  const layerFailed = /^[ \t>*-]*(visual|token|code)\s*:\s*(fail|blocked)\b/im.test(report);
  const verdictLine = /^[ \t>*-]*verify\s*:\s*(pass|issues|blocked)\b/im.exec(report);

  // The machine-readable verdict block is AUTHORITATIVE when present. A report can carry a
  // clean `VERIFY: PASS` (all VISUAL/TOKEN/CODE = pass) AND still list prose "open items" —
  // e.g. token-sync follow-ups like `--spacing-48` or a hover-color mismatch flagged for
  // /sync-tokens. Those are NOT verification failures, so a `status: open` in the prose must
  // NOT override a passing verdict (the bug: 10 components read PASS but showed "has issues").
  if (verdictLine) {
    const verdictNotPass = /^(issues|blocked)$/i.test(verdictLine[1]);
    if (!layerFailed && !verdictNotPass) return { unresolved: false, issues: [] };
    const layerIssues = [...report.matchAll(/^[ \t>*-]*(visual|token|code)\s*:\s*(fail|blocked)\b[^\n]*/gim)].map(
      (m) => m[0].trim(),
    );
    return { unresolved: true, issues: layerIssues };
  }

  // Legacy report (no machine-readable block): fall back to the prose heuristic.
  const hasOpen = /status:\s*open/i.test(report) || /open (discrepanc|source-level)/i.test(report);
  if (!hasOpen && !layerFailed) return { unresolved: false, issues: [] };
  const issues = [...report.matchAll(/^###\s+(D\d[^\n]*)/gm)].map((m) => m[1].trim());
  return { unresolved: true, issues: issues.length ? issues : ["open discrepancies"] };
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
  const verdict = reportUnresolved(report);
  if (verdict.unresolved) {
    return { status: "has-issues", issues: verdict.issues, specPath, reportPath };
  }
  return { status: "verified", issues: [], specPath, reportPath };
}

/**
 * Which other roster components a component's source renders — its `dependsOn`
 * (Plan B1c), used for bottom-up generation order. Deterministic: a roster name N is
 * a dependency of the source when it appears as a JSX opening tag `<N` (word-bounded,
 * so `<Button` matches but `<ButtonGroup` does not). Excludes the component itself.
 * Returns normalized names, sorted.
 */
export function componentDeps(source: string, roster: string[], self: string): string[] {
  const selfNorm = normComponentName(self);
  const src = stripComments(source); // don't count `// <Button>` in a comment as a dep
  const deps = new Set<string>();
  for (const name of roster) {
    const norm = normComponentName(name);
    if (norm === selfNorm) continue;
    // JSX tag use: `<Name` followed by whitespace, `>`, or `/` (not another name char).
    if (new RegExp(`<${escapeRe(name)}(?![A-Za-z0-9])`).test(src)) deps.add(norm);
  }
  return [...deps].sort();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Read the project's components, cached by an input fingerprint (Plan B2): a warm cache
 * returns the stored result without re-reading every component source. The derived
 * component map (`.vortspec/maps/components.json`) is an OUTPUT, not an input.
 */
export async function getInspectorComponents(
  projectPath: string,
): Promise<InspectorComponentsResult> {
  const config = await readProjectConfig(projectPath);
  return cachedScan<InspectorComponentsResult>(
    projectPath,
    "components",
    {
      files: [".sdd-de/project.yaml", ".sdd-de/components.json", ".vortspec/figma-components.json"],
      dirs: config?.componentDir ? [config.componentDir] : [],
    },
    () => computeInspectorComponents(projectPath),
    inspectorComponentsResultSchema,
  );
}

async function computeInspectorComponents(
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
  const rosterNames = manifest.map((m) => m.name);
  const srcByName = new Map<string, string>();
  const components: InspectorComponent[] = [];
  for (const entry of manifest) {
    const abs = await findSourceFile(root, entry.name);
    const file = abs ? abs.slice(projectPath.length + 1) : null;
    let props: PropControl[] = [];
    let tokens: string[] = [];
    if (abs && file) {
      const src = await readFile(abs, "utf8").catch(() => "");
      srcByName.set(entry.name, src);
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
      variants: entry.variants,
      file,
      props,
      tokens,
      status,
      issues,
      specPath,
      reportPath,
    });
  }

  // Figma-authoritative overlay (Wave 3): match the code roster against the
  // components read from Figma by figma-cli. Absent export → figmaComps is null
  // and every component stays plain code with no figma badge.
  const figmaComps = await readFigmaComponents(projectPath);
  const recon = figmaComps ? reconcileComponents(components.map((c) => c.name), figmaComps) : null;
  // Durable-key join (Plan B1c): prefer the recorded componentKey over the name match,
  // so a Figma rename doesn't drop the badge. Figma components carry their key from sync.
  const compMap = await readComponentMap(projectPath);
  const figmaByKey = new Map((figmaComps ?? []).filter((f) => f.key).map((f) => [f.key as string, f]));
  const figmaByName = new Map((figmaComps ?? []).map((f) => [normComponentName(f.name), f]));

  const joins: { name: string; componentKey?: string; componentSetId?: string; dependsOn?: string[] }[] = [];
  const withFigma: InspectorComponent[] = components.map((c) => {
    const norm = normComponentName(c.name);
    const dependsOn = componentDeps(srcByName.get(c.name) ?? "", rosterNames, c.name);
    // 1) durable key (recorded) → 2) name match. Both yield the full Figma component,
    // so a name match still records the durable key (bootstrapping the join).
    const recordedKey = compMap.components[norm]?.componentKey;
    const fig = (recordedKey ? figmaByKey.get(recordedKey) : undefined) ?? figmaByName.get(norm);
    if (fig || dependsOn.length) {
      joins.push({ name: c.name, componentKey: fig?.key, componentSetId: fig?.id, dependsOn });
    }
    return fig
      ? { ...c, figmaBacked: true, figmaVariants: fig.variants, figmaKey: fig.key, dependsOn }
      : { ...c, dependsOn };
  });

  // Persist confident component keys + the dependency graph (guarded — writes on change).
  await mergeComponentEntries(projectPath, joins);

  return {
    componentDir,
    previewUrl: null,
    components: withFigma,
    figmaOnly: recon?.figmaOnly ?? [],
    figmaSynced: figmaComps !== null,
  };
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
