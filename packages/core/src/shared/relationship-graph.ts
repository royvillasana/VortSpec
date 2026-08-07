import { ALL_NON_COMPONENT_SUFFIXES, profileFor } from "./framework-profiles";

/**
 * The component relationship graph — OpenSpec change: agentic-design-system, group 2.
 *
 * The layer that did not exist at all before this change: `grep usedBy` across `packages/` returned
 * nothing, and `InspectorComponent.dependsOn` is the Figma-plan bottom-up build order with no reverse
 * edge and no notion of how often a component is actually rendered.
 *
 * PURE — no fs. Every function takes source TEXT and returns data, so the whole graph is testable
 * against in-memory fixtures. The fs half (walking, caching, serializing) lives in
 * `main/inspector/relationship-index.ts`.
 *
 * TWO DOCUMENTED BUGS from the reference series are designed out here rather than fixed later
 * (`docs/agentic-design-system-plan.md` §1.2):
 *
 *  1. **Stem keying.** Keying an entry on a file's basename silently overwrites any two files that
 *     share one — `src/pages/index.tsx` and `src/pages/skills/index.tsx` become one entry, and the
 *     loser's relationships vanish. Every key here is the full project-relative path.
 *  2. **Import counting as adoption.** An import says a component was mentioned; only an INSTANCE
 *     says it was rendered. Counting imports reports a component as adopted when a refactor left the
 *     import behind — which is precisely the state worth finding.
 */

// ── Imports ──────────────────────────────────────────────────────────

/** One resolved import: the specifier as written, and what it names. */
export interface ImportRecord {
  /** The module specifier exactly as it appears in source (`./Button`, `@/components/Card`). */
  specifier: string;
  /** Imported binding names — `default` for a default import, `*` for a namespace import. */
  names: string[];
}

/**
 * `import … from "…"` in every form that binds a name, across every framework this supports.
 *
 * One regex for all of them because every framework in the table — React, Vue SFC, Svelte, Angular,
 * Astro, Solid — writes its imports as ES modules. The frameworks differ in their TEMPLATE syntax,
 * which is what `countInstances` handles, not in how they import.
 *
 * Side-effect imports (`import "./styles.css"`) are deliberately skipped: they bind no name, so they
 * can never produce an instance and counting them would inflate every file's import list with CSS.
 */
const IMPORT_RE =
  /import\s+(?!type\s)([\w*{}\s,$]+?)\s+from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** `export { X } from "./X"` — a barrel re-export. It carries a name onward, so it counts. */
const REEXPORT_RE = /export\s+(?:\*|{[^}]*})\s+from\s*['"]([^'"]+)['"]/g;

/**
 * Strip comments (and template literals) so commented-out code never registers.
 *
 * A commented-out import is the single most common false positive in a codebase mid-refactor —
 * which is exactly when this data gets read. QUOTED strings are deliberately LEFT IN: a module
 * specifier lives inside quotes, so removing them here would erase every import this is called to
 * find. Instance counting needs the stronger strip and calls `stripLiterals` instead.
 */
export function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\w"'`])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * `stripNonCode`, plus quoted strings — what instance counting sees.
 *
 * `const doc = "<Button/>"` is documentation, a code sample, or an error message; counting it as a
 * render would inflate exactly the number this module exists to make trustworthy. Safe here because
 * a template body never expresses an instance inside a string literal.
 */
export function stripLiterals(source: string): string {
  return stripNonCode(source)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

/** Every named import in a file, in source order. */
export function parseImports(source: string): ImportRecord[] {
  const src = stripNonCode(source);
  const out: ImportRecord[] = [];
  for (const match of src.matchAll(IMPORT_RE)) {
    const specifier = match[2] ?? match[3];
    if (!specifier) continue;
    const clause = match[1] ?? "";
    out.push({ specifier, names: parseImportClause(clause) });
  }
  for (const match of src.matchAll(REEXPORT_RE)) out.push({ specifier: match[1], names: ["*"] });
  return out;
}

function parseImportClause(clause: string): string[] {
  const names: string[] = [];
  const braced = clause.match(/{([^}]*)}/);
  if (braced)
    for (const part of braced[1].split(","))
      // `{ Button as Btn }` binds `Btn`; the LOCAL name is what a template can reference.
      names.push((part.split(/\sas\s/).pop() ?? "").trim());
  const outside = clause.replace(/{[^}]*}/, "").replace(/,/g, " ").trim();
  for (const token of outside.split(/\s+/)) {
    if (!token) continue;
    if (token === "*") continue;
    names.push(token);
  }
  return names.filter(Boolean);
}

// ── Resolving a specifier to a file in the project ───────────────────

export interface ResolveContext {
  /** Every project-relative source path in the project, for extension/index resolution. */
  files: ReadonlySet<string>;
  /** Alias prefix → project-relative directory, e.g. `{"@/": "src/"}`. */
  aliases?: Readonly<Record<string, string>>;
  /** Extensions to try, most specific first. */
  extensions: readonly string[];
}

/**
 * A module specifier → the project-relative file it names, or null for a package import.
 *
 * Null for a bare specifier (`react`, `@vendor/ui`) is correct and load-bearing: those are the
 * CONSUMED library's components, which for an `enterprise`/`library` source is most of the roster.
 * They are relationships between this project and a package, not edges inside the graph, and
 * inventing a node for them would report a design system that does not exist here.
 */
export function resolveSpecifier(
  specifier: string,
  fromFile: string,
  context: ResolveContext,
): string | null {
  let base: string;
  if (specifier.startsWith(".")) {
    base = joinPosix(dirnamePosix(fromFile), specifier);
  } else {
    const alias = Object.entries(context.aliases ?? {}).find(([prefix]) =>
      specifier.startsWith(prefix),
    );
    if (!alias) return null; // a package, not a file in this project
    base = joinPosix(alias[1], specifier.slice(alias[0].length));
  }
  if (context.files.has(base)) return base;
  for (const extension of context.extensions) {
    const candidate = `${base}${extension}`;
    if (context.files.has(candidate)) return candidate;
  }
  // A directory import resolves to its index file.
  for (const extension of context.extensions) {
    const candidate = `${base}/index${extension}`;
    if (context.files.has(candidate)) return candidate;
  }
  return null;
}

function dirnamePosix(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Join and normalise `.`/`..` segments — the paths here are always POSIX, never OS-specific. */
function joinPosix(base: string, relative: string): string {
  const segments = [...base.split("/"), ...relative.split("/")].filter(Boolean);
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

// ── How a component is written in a template ─────────────────────────

/**
 * Every tag name a component can be RENDERED as.
 *
 * A component's class name and its template tag are the same thing only in JSX. Everywhere else
 * they are not, and assuming they are makes the graph silently edgeless:
 *
 *  • **Angular** declares an unrelated element selector — class `ButtonComponent`, tag
 *    `<app-button>`. Nothing about the class name predicts it, so it must be READ from the source.
 *  • **Vue** resolves `MyButton` and `<my-button>` to the same component, and templates commonly
 *    use the kebab form. That mapping is deterministic, so it is derived rather than parsed.
 *  • **Web components** register their own tag through `customElements.define("vs-button", …)`.
 *  • **React / Svelte / Astro / Solid** use the name as written.
 *
 * Returning a SET rather than one name is what lets `countInstances` match a lowercase tag safely:
 * only a tag in this set counts, so a plain `<div>` is never mistaken for a component.
 */
export function tagAliasesFor(name: string, source: string): string[] {
  const aliases = new Set<string>();
  if (name) {
    aliases.add(name);
    const kebab = kebabCase(name);
    if (kebab && kebab !== name) aliases.add(kebab);
  }
  for (const selector of declaredSelectors(source)) aliases.add(selector);
  return [...aliases];
}

/**
 * The markup inside an INLINE template property — Angular's `template:` and Vue's option of the
 * same name.
 *
 * `stripLiterals` erases quoted strings so `const doc = "<Button/>"` is never counted as a render.
 * That is right for documentation and wrong for exactly one thing: an inline template, where the
 * string genuinely IS markup. Extracting it by property NAME keeps both true — the value of a
 * `template:` is markup, and every other string still is not.
 */
export function inlineTemplates(source: string): string {
  const pattern = /\btemplate\s*:\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  const out: string[] = [];
  for (const match of source.matchAll(pattern)) out.push(match[1].slice(1, -1));
  return out.join("\n");
}

/** `MyButton` → `my-button`. Vue's own PascalCase↔kebab resolution, and the web-component form. */
export function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** An Angular `selector:` and any `customElements.define(...)` tag declared in a source file. */
export function declaredSelectors(source: string): string[] {
  const src = stripNonCode(source);
  const out = new Set<string>();

  // @Component({ … selector: 'app-button' … }). The selector can be a list and can carry attribute
  // or class forms (`'app-button, [appButton]'`); only the ELEMENT forms can appear as a tag.
  for (const match of src.matchAll(/selector\s*:\s*['"]([^'"]+)['"]/g))
    for (const part of match[1].split(","))
      if (/^[a-z][\w-]*$/i.test(part.trim())) out.add(part.trim());

  for (const match of src.matchAll(/customElements\s*\.\s*define\s*\(\s*['"]([^'"]+)['"]/g))
    out.add(match[1]);

  return [...out];
}

// ── Instances ────────────────────────────────────────────────────────

/**
 * How many times a component is actually RENDERED in a file, and how deep it sits.
 *
 * `depth` is the nesting depth of the shallowest instance, which is what makes composition legible:
 * a component only ever rendered at depth 4 is a leaf, one at depth 0 is a page-level building block.
 */
export interface InstanceCount {
  count: number;
  depth: number;
  /** True when at least one instance sits inside a slot/children position of another component. */
  slotNested: boolean;
}

/**
 * Count instances of `name` in a template body.
 *
 * SLOT-NESTED INSTANCES ARE DE-DUPLICATED. `<Card><Button/></Card>` renders one Button, but a naive
 * scan that also walks `Card`'s own children — or that counts the same node once per enclosing
 * component — double-counts it. The reference series attributes a 75% → 95% accuracy jump to exactly
 * this, so it is handled here rather than accepted as noise: each opening tag is counted ONCE, at the
 * position it occurs, regardless of what encloses it.
 *
 * Self-closing and paired tags both count; a closing tag never does.
 */
export function countInstances(
  source: string,
  nameOrAliases: string | readonly string[],
): InstanceCount {
  // Literal-stripped code PLUS any inline template, which is markup wearing a string's clothes.
  const src = `${stripLiterals(source)}\n${inlineTemplates(source)}`;
  const aliases = typeof nameOrAliases === "string" ? [nameOrAliases] : [...nameOrAliases];
  if (aliases.length === 0) return { count: 0, depth: 0, slotNested: false };
  const targets = new Set(aliases);
  // Depth is tracked over every tag that could BE a component: PascalCase (JSX and friends) plus any
  // declared alias. A lowercase tag counts ONLY when it is a known alias, so `<div>` is never
  // mistaken for a component — which is the whole reason aliases are a resolved set, not a guess.
  const aliasPattern = aliases.map(escapeRe).join("|");
  const anyTag = new RegExp(`<(/?)([A-Z][\\w.]*|${aliasPattern})(?=[\\s/>])|(/>)`, "g");
  let depth = 0;
  let minDepth = Number.POSITIVE_INFINITY;
  let count = 0;
  let slotNested = false;

  for (const match of src.matchAll(anyTag)) {
    if (match[3]) {
      // A self-closing terminator for the tag we just opened.
      depth = Math.max(0, depth - 1);
      continue;
    }
    const closing = match[1] === "/";
    const tagName = match[2];
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (targets.has(tagName)) {
      count++;
      minDepth = Math.min(minDepth, depth);
      if (depth > 0) slotNested = true;
    }
    depth++;
  }
  return {
    count,
    depth: Number.isFinite(minDepth) ? minDepth : 0,
    slotNested,
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── The graph ────────────────────────────────────────────────────────

/** One file in the project, as the graph sees it. */
export interface GraphFile {
  /** Project-relative path — the KEY. Never a basename. */
  path: string;
  source: string;
  /** The component this file defines, when it defines one. */
  component?: string;
  /**
   * Whether this file is part of the DESIGN SYSTEM (under `component_dir`) rather than a consumer
   * of it — a page, a screen, a feature.
   *
   * Only used by shadow detection, where it supplies the direction. A shadow is not a symmetric
   * relationship: "this page reimplements Button" is a finding, and "Button resembles this page" is
   * noise. Without the distinction the detector reports both and doubles its own false-positive
   * rate. Absent means "not a design-system component", so a caller that does not know simply gets
   * no shadow findings rather than a flood of reversed ones.
   */
  designSystem?: boolean;
}

/**
 * How adopted a component is — the PRIMARY signal, and the one consumers should branch on.
 *
 * Exists because `efficiency` alone cannot express the three states honestly. A component nothing
 * imports has no ratio at all, and the obvious encodings both lie: `0` reports a brand-new component
 * as the worst-adopted thing in the system, and `undefined` makes every consumer re-derive "absent
 * means never imported, not zero" from a comment. Sorting a report by efficiency is exactly where
 * that gets it wrong once and stays wrong.
 *
 *  • `unimported`             — nothing imports it. New, or dead; the graph cannot tell which, and
 *                               says so rather than guessing.
 *  • `imported-never-rendered` — imported somewhere and rendered nowhere. The drag case worth acting on.
 *  • `adopted`                — rendered at least once.
 */
export type AdoptionState = "unimported" | "imported-never-rendered" | "adopted";

export interface ComponentUsage {
  /** The component's own file. */
  path: string;
  name: string;
  /** Files that import it. */
  importedBy: string[];
  /** Components it renders, resolved through the import graph. */
  uses: string[];
  /** Components that render it. */
  usedBy: string[];
  importCount: number;
  /** How many times it is actually rendered, across every file. */
  instanceCount: number;
  /** The state to branch on. `efficiency` is a detail of it, not a substitute for it. */
  adoption: AdoptionState;
  /**
   * Whether this node is a DESIGN-SYSTEM component rather than a consumer of one.
   *
   * Pages are nodes too, and have to be: "list the components used on the entry page" and "how many
   * of these are used on other pages" — two of the four benchmark questions — are questions ABOUT
   * pages, and a graph containing only design-system components cannot answer either. The flag is
   * what keeps "how many components do we have" from counting them.
   */
  designSystem: boolean;
  /**
   * `instanceCount / importCount` — how much rendering each import buys. Present only when the
   * component is imported at all, because a ratio over zero is not a low score, it is no score.
   */
  efficiency?: number;
}

export interface RelationshipGraph {
  components: ComponentUsage[];
  /** Paths that import a component without rendering it, per component. */
  importedNeverRendered: { component: string; files: string[] }[];
}

/**
 * Build the graph from the project's files.
 *
 * `components` maps a component NAME to the file that defines it. Two files defining the same name
 * is a real (and reported) condition, not an error to throw on — a design system mid-migration has
 * them — so the first wins and the graph stays keyed on paths throughout.
 */
export function buildRelationshipGraph(
  files: readonly GraphFile[],
  options: { aliases?: Record<string, string>; framework?: string } = {},
): RelationshipGraph {
  const profile = profileFor(options.framework);
  const extensions = profile?.sourceExts ?? [".tsx", ".ts", ".jsx", ".js", ".vue", ".svelte", ".astro"];
  const paths = new Set(files.map((file) => file.path));
  const context: ResolveContext = { files: paths, aliases: options.aliases, extensions };

  const byPath = new Map(files.map((file) => [file.path, file]));
  const definitionOf = new Map<string, string>(); // component name → defining path
  for (const file of files) if (file.component && !definitionOf.has(file.component)) definitionOf.set(file.component, file.path);

  // Every tag each component can be rendered as. Resolved ONCE, from the component's own source,
  // because an Angular selector is only knowable by reading it — see `tagAliasesFor`.
  const aliasesOf = new Map<string, string[]>();
  for (const [name, path] of definitionOf)
    aliasesOf.set(name, tagAliasesFor(name, byPath.get(path)?.source ?? ""));

  const usage = new Map<string, ComponentUsage>();
  for (const [name, path] of definitionOf)
    usage.set(name, {
      path,
      name,
      importedBy: [],
      uses: [],
      usedBy: [],
      importCount: 0,
      instanceCount: 0,
      adoption: "unimported",
      designSystem: byPath.get(path)?.designSystem === true,
    });

  const neverRendered = new Map<string, string[]>();

  for (const file of files) {
    // Which components this file imports, and under what local name.
    const localToComponent = new Map<string, string>();
    const importedNames = new Set<string>();
    for (const record of parseImports(file.source)) {
      const target = resolveSpecifier(record.specifier, file.path, context);
      if (!target) continue; // package import — outside this graph, deliberately
      const targetFile = byPath.get(target);
      const names = record.names.includes("*") && targetFile?.component ? [targetFile.component] : record.names;
      for (const local of names) {
        // A named import matching a defined component, or a default import of a component file.
        const component =
          definitionOf.has(local) && definitionOf.get(local) === target
            ? local
            : targetFile?.component;
        if (!component) continue;
        localToComponent.set(local, component);
        importedNames.add(local);
      }
    }

    // A rendered tag whose name matches a known component, with NO import to explain it.
    //
    // Requiring an import would be React-centric and would lose real edges: an Angular template
    // renders a component declared in its module, and a globally-registered Vue component needs no
    // import either. The tag name matching a defined component IS the signal; the import only tells
    // us the LOCAL alias when there is one. So these are counted as instances and as edges, but NOT
    // as imports — `importCount` stays honestly about imports, which is what makes `efficiency`
    // mean something.
    const importedComponents = new Set(localToComponent.values());
    for (const [name] of definitionOf) {
      if (importedComponents.has(name)) continue;
      if (definitionOf.get(name) === file.path) continue; // a component is not its own instance
      if (countInstances(file.source, aliasesOf.get(name) ?? [name]).count === 0) continue;
      localToComponent.set(name, name);
    }

    for (const [local, component] of localToComponent) {
      const entry = usage.get(component);
      if (!entry) continue;
      // `local === component` with no matching import means the tag was found without one — see
      // above. Such a render must not inflate the import count.
      const wasImported = importedNames.has(local);
      if (wasImported) {
        entry.importCount++;
        if (!entry.importedBy.includes(file.path)) entry.importedBy.push(file.path);
      }

      // An IMPORTED component is referenced by its local binding; an un-imported one by any tag it
      // declares. Using the alias set for an import alias would match the wrong thing when a file
      // renames on import.
      const instances = countInstances(
        file.source,
        importedNames.has(local) ? local : (aliasesOf.get(component) ?? [local]),
      );
      entry.instanceCount += instances.count;
      if (instances.count === 0 && wasImported) {
        // The bug the series names: an import is not adoption. Recorded per component AND per file,
        // because "Button is unused" and "this file forgot to delete an import" are different fixes.
        neverRendered.set(component, [...(neverRendered.get(component) ?? []), file.path]);
      } else if (file.component && file.component !== component) {
        if (!entry.usedBy.includes(file.component)) entry.usedBy.push(file.component);
        const parent = usage.get(file.component);
        if (parent && !parent.uses.includes(component)) parent.uses.push(component);
      }
    }
  }

  for (const entry of usage.values()) {
    entry.importedBy.sort();
    entry.uses.sort();
    entry.usedBy.sort();
    if (entry.importCount > 0) entry.efficiency = round(entry.instanceCount / entry.importCount);
    entry.adoption =
      entry.instanceCount > 0
        ? "adopted"
        : entry.importCount > 0
          ? "imported-never-rendered"
          : "unimported";
  }

  return {
    // Everything the caller passed is reported. Deciding what is WORTH WRITING is the artifact's
    // job, not the graph's — the graph does not know which files are the design system unless it
    // was told, and a pure function that silently dropped nodes would make its own tests lie.
    components: [...usage.values()].sort((a, b) => a.name.localeCompare(b.name)),
    importedNeverRendered: [...neverRendered.entries()]
      .map(([component, list]) => ({ component, files: [...new Set(list)].sort() }))
      .sort((a, b) => a.component.localeCompare(b.component)),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Follow `uses` transitively from a component — the "recursive chain resolution" the task asks for.
 *
 * Cycle-safe by construction: a design system genuinely can contain one (a `Menu` rendering a
 * `MenuItem` that renders a nested `Menu`), so this returns what is reachable rather than treating a
 * cycle as an error.
 */
export function resolveChain(graph: RelationshipGraph, name: string): string[] {
  const byName = new Map(graph.components.map((component) => [component.name, component]));
  const seen = new Set<string>();
  const queue = [...(byName.get(name)?.uses ?? [])];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(byName.get(next)?.uses ?? []));
  }
  seen.delete(name);
  return [...seen].sort();
}

/** Whether a file is a component source rather than a test/story/config sibling. */
export function isComponentFile(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return !ALL_NON_COMPONENT_SUFFIXES.some((suffix) => base.includes(`${suffix}.`));
}

// ── Shadow implementations (task 2.5) ────────────────────────────────

/**
 * A file that REIMPLEMENTS a component instead of importing it.
 *
 * The failure this catches is quiet and common: someone needs a button, does not find or does not
 * reach for `Button`, and writes the markup inline with the right tokens. Nothing is broken, every
 * value is a token, the audit passes — and the design system has silently forked. It shows up later
 * as "why did the button radius change everywhere except this page".
 *
 * Reported at `warning`, never `error`. A shadow is a JUDGEMENT — sometimes the inline markup is
 * genuinely a different thing that happens to share a palette — and an error would either be
 * overridden or force someone to contort real code to silence it.
 */
export interface ShadowFinding {
  /** The component being shadowed. */
  component: string;
  /** The file doing the shadowing. */
  file: string;
  /** The tokens both use — the evidence. */
  sharedTokens: string[];
  /** The element both build on (`button`, `input`), when they agree on one. */
  element?: string;
  /** 0–1: how much of the component's token signature the file reproduces. */
  overlap: number;
}

/**
 * Thresholds. Deliberately conservative, because the cost of the two errors is not symmetric: a
 * missed shadow is a component that stays duplicated until someone notices, while a FALSE shadow
 * tells a developer their working code is a mistake — and a detector that cries wolf is one people
 * learn to ignore, which loses the true positives too.
 */
const SHADOW_MIN_SHARED_TOKENS = 3;
const SHADOW_MIN_OVERLAP = 0.6;

/** The HTML element a component is built on — its root tag, lowercased. */
export function rootElement(source: string): string | undefined {
  const match = stripLiterals(source).match(/<([a-z][a-z0-9]*)(?=[\s/>])/);
  return match?.[1];
}

/** Design tokens a source references: `var(--x)`, `--x`, and `$x`. */
export function tokensUsed(source: string): string[] {
  const src = stripNonCode(source);
  const out = new Set<string>();
  for (const match of src.matchAll(/--([\w-]+)(?![\w-])/g)) out.add(match[1]);
  for (const match of src.matchAll(/\$([a-zA-Z][\w-]*)/g)) out.add(match[1]);
  return [...out].sort();
}

/**
 * Find files that reproduce a component's token signature without importing it.
 *
 * Three conditions, all required:
 *  1. the file does NOT import the component — importing and re-styling is customisation, not a fork;
 *  2. it reuses at least `SHADOW_MIN_SHARED_TOKENS` of the component's tokens, so a shared
 *     `--color-text` alone can never trigger it;
 *  3. it reproduces at least `SHADOW_MIN_OVERLAP` of the component's whole signature.
 *
 * When both declare a root element they must AGREE on it. A `<div>` sharing a button's palette is a
 * card, not a shadowed button, and that single check removes most of the noise this would otherwise
 * produce.
 */
export function findShadowImplementations(
  files: readonly GraphFile[],
  graph: RelationshipGraph,
  options: { aliases?: Record<string, string>; framework?: string } = {},
): ShadowFinding[] {
  const profile = profileFor(options.framework);
  const extensions = profile?.sourceExts ?? [".tsx", ".ts", ".jsx", ".js", ".vue", ".svelte", ".astro"];
  const paths = new Set(files.map((file) => file.path));
  const context: ResolveContext = { files: paths, aliases: options.aliases, extensions };
  const byPath = new Map(files.map((file) => [file.path, file]));

  const signatures = new Map<string, { tokens: Set<string>; element?: string; path: string }>();
  for (const component of graph.components) {
    const file = byPath.get(component.path);
    // Only a DESIGN-SYSTEM component can be shadowed — see `GraphFile.designSystem`. A page is not
    // something another file should have imported instead.
    if (!file || !file.designSystem) continue;
    const tokens = new Set(tokensUsed(file.source));
    // A component with almost no tokens has no signature to match, and treating it as one would
    // make every file in the project look like its shadow.
    if (tokens.size < SHADOW_MIN_SHARED_TOKENS) continue;
    signatures.set(component.name, { tokens, element: rootElement(file.source), path: component.path });
  }

  const out: ShadowFinding[] = [];
  for (const file of files) {
    const imported = new Set(
      parseImports(file.source)
        .map((record) => resolveSpecifier(record.specifier, file.path, context))
        .filter((path): path is string => !!path),
    );
    const fileTokens = new Set(tokensUsed(file.source));
    const fileElement = rootElement(file.source);

    for (const [name, signature] of signatures) {
      if (file.path === signature.path) continue; // the component itself
      if (imported.has(signature.path)) continue; // condition 1
      const shared = [...signature.tokens].filter((token) => fileTokens.has(token));
      if (shared.length < SHADOW_MIN_SHARED_TOKENS) continue; // condition 2
      const overlap = shared.length / signature.tokens.size;
      if (overlap < SHADOW_MIN_OVERLAP) continue; // condition 3
      if (signature.element && fileElement && signature.element !== fileElement) continue;
      out.push({
        component: name,
        file: file.path,
        sharedTokens: shared.sort(),
        ...(signature.element && fileElement === signature.element ? { element: signature.element } : {}),
        overlap: round(overlap),
      });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.component.localeCompare(b.component));
}

/** A shadow finding → the one-line message a person reads, naming both sides and the fix. */
export function describeShadow(finding: ShadowFinding): string {
  return (
    `${finding.file} reuses ${finding.sharedTokens.length} of ${finding.component}'s design tokens` +
    `${finding.element ? ` on the same <${finding.element}>` : ""} without importing it` +
    ` — import ${finding.component} instead of reimplementing it.`
  );
}
