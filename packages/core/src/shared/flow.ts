import { z } from "zod";
import { runUsageSchema } from "./run-events";

/**
 * The SDD-DE guided flow model. Stages are data-driven so they can be aligned
 * to the real SDD-DE CLI cycle once confirmed (seam: `DEFAULT_FLOW`). Flow state
 * is persisted as plain JSON in the project (`.vortspec/flow.json`) so it is
 * always derivable from disk and survives closing/reopening the app.
 */

export const stageKindSchema = z.enum([
  "source",
  "components",
  "input",
  "intake",
  "agent",
  "verify",
  "manifest",
]);
export type StageKind = z.infer<typeof stageKindSchema>;

export const stageStatusSchema = z.enum([
  "pending",
  "running",
  "needs-review",
  "approved",
  "failed",
]);
export type StageStatus = z.infer<typeof stageStatusSchema>;

export const stageDefSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: stageKindSchema,
  /** produces an artifact that must be approved before advancing */
  gated: z.boolean().default(false),
  /** not required for the flow to be considered complete (e.g. publishing to
   *  GitHub). Optional stages can be run/skipped freely and never block. */
  optional: z.boolean().optional(),
  /** relative path of the artifact this stage produces, if any (fixed path) */
  artifact: z.string().optional(),
  /** filename suffix to resolve under specs/ when the path is dynamic
   *  (SDD-DE writes specs/[feature-name]/…, so the feature name is not known ahead of time) */
  artifactGlob: z.string().optional(),
  /** prompt handed to Claude Code for agent/verify stages */
  promptTemplate: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
});
export type StageDef = z.infer<typeof stageDefSchema>;

export const stageStateSchema = z.object({
  id: z.string(),
  status: stageStatusSchema,
  updatedAt: z.string(),
  decisionNotes: z.string().optional(),
});
export type StageState = z.infer<typeof stageStateSchema>;

/** A component detected in the design source, written to `.sdd-de/components.json`. */
export const detectedComponentSchema = z.object({
  name: z.string(),
  level: z.enum(["atom", "molecule", "organism"]).optional(),
  description: z.string().optional(),
  /**
   * Variant axis names for a COMPONENT_SET / variant family — e.g.
   * ["type", "size"] or ["orientation", "control"]. Detection collapses a whole
   * variant set into ONE entry carrying its axes here, instead of emitting one
   * entry per variant (which explodes a `form-item` set into 40 rows).
   */
  variants: z.array(z.string()).optional(),
  /**
   * The component's authoritative Figma reference, recorded at detection so build and
   * verify can fetch its design and validate against it WITHOUT asking the user for a
   * link (change: figma-node-reference). `figmaNodeId` is the component set's node id;
   * `componentKey` is its durable library key when available.
   */
  figmaNodeId: z.string().optional(),
  /** The agent sometimes writes the node id as `nodeId` instead of `figmaNodeId`. */
  nodeId: z.string().optional(),
  componentKey: z.string().optional(),
});
export type DetectedComponent = z.infer<typeof detectedComponentSchema>;

/**
 * Parse `.sdd-de/components.json`. The agent may write EITHER a flat array of components
 * OR a rich wrapper object `{ complete, totals, notes, components: [...] }` (the extract
 * skill's metadata form). Accept both — a wrapper whose `components` array failed to be
 * unwrapped was reported as "zero components detected" even though 59 were present.
 */
export const detectedComponentsSchema = z.preprocess((v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const inner = (v as { components?: unknown }).components;
    if (Array.isArray(inner)) return inner;
  }
  return v;
}, z.array(detectedComponentSchema));

export const COMPONENTS_MANIFEST = ".sdd-de/components.json";

export const flowStateSchema = z.object({
  currentStageId: z.string(),
  stages: z.array(stageStateSchema),
  /** Opt-in GitHub publish target (a repo URL). Only the URL is stored — never
   *  credentials; the push runs through the user's own git/gh in the commit stage. */
  publishRepoUrl: z.string().optional(),
});
export type FlowState = z.infer<typeof flowStateSchema>;

/** The full flow presented to the renderer: definitions + live state. */
export const flowSchema = z.object({
  definitions: z.array(stageDefSchema),
  state: flowStateSchema,
});
export type Flow = z.infer<typeof flowSchema>;

// ── Run history (US-11) ──────────────────────────────────────────────

export const runStageSummarySchema = z.object({
  name: z.string(),
  decision: z.string(),
  status: z.enum(["done", "review", "cancelled", "pending"]),
});
export type RunStageSummary = z.infer<typeof runStageSummarySchema>;

export const runSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  outcome: z.enum(["running", "in-review", "passed", "cancelled", "failed", "in-progress"]),
  updatedAt: z.string(),
  stages: z.array(runStageSummarySchema),
  artifacts: z.array(z.string()),
  // Instrumentation (optional, additive — older records omit these).
  tokens: runUsageSchema.optional(),
  costUsd: z.number().optional(),
  /** The model the run actually used (for measuring model routing). */
  model: z.string().optional(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

export const runHistoryResultSchema = z.object({ runs: z.array(runSummarySchema) });
export type RunHistoryResult = z.infer<typeof runHistoryResultSchema>;

/**
 * The SDD-DE mandatory cycle (from @royvillasana/sdd-de docs/sdd-mandatory-steps.md).
 * The app drives these exact steps via the installed skills (`/enrich-brief`,
 * `/generate-artifacts`, `/visual-verify`, `/sync-tokens`, `/commit`) — it never
 * invents methodology. Skill invocation works in headless `-p` mode.
 */
export const DEFAULT_FLOW: StageDef[] = [
  {
    id: "design-system",
    title: "Design system",
    summary:
      "Connect to your configured design source (e.g. the Figma file), extract design tokens + variables, and detect every component — no brief needed.",
    kind: "source",
    gated: true,
    artifact: COMPONENTS_MANIFEST,
    promptTemplate:
      "Read .sdd-de/project.yaml for `design_source` and the project configuration " +
      "(framework, language, token_file, component_dir). Connect to the configured source — do NOT " +
      "ask for a brief; the design source is the input.\n\n" +
      "For `design_source: figma`, first note the CONFIGURED file key from `figma_file_url` " +
      "(`https://figma.com/design/<FILE_KEY>/…`). Everything you extract MUST come from THAT file and no " +
      "other. ENUMERATE THE WHOLE FILE — every page and every component set, not a subset. PREFER the Figma " +
      "Desktop Bridge (the figma-console plugin): it lists ALL pages via `figma.root.children` and gives a " +
      "complete component + variable dump on any Figma plan. **BUT the Desktop Bridge reads whatever file is " +
      "currently OPEN in Figma Desktop** — before extracting, CONFIRM the open file's key matches the " +
      "configured `<FILE_KEY>` (check `figma.root` / the file url). If a DIFFERENT file is open, do NOT " +
      "extract from it — that is how a scan silently reads the wrong design system; instead use the remote " +
      "Figma MCP, which reads the configured file BY KEY (paginate past its 3-page listing cap via the " +
      "design-system search below), or stop and tell the user to open the configured file in Figma Desktop. " +
      "`figma_get_design_system_summary` + `figma_search_components` enumerate the FULL component set. " +
      "CRITICAL: do NOT use the file's page listing / `get_metadata` as the component inventory — the remote " +
      "Figma MCP's page listing CAPS AT 3 PAGES, so a 14-page page-per-component library would wrongly detect " +
      "as ~8 documentation/foundation entries (icon/text/paragraph/callout/table/header) and MISS the real " +
      "components (Alerts, Buttons, Card, Carousel, Dropdowns, Navbar, Tooltips, Input, Form). If the Desktop " +
      "Bridge is unavailable, still cover EVERY component: use the remote MCP's `search_design_system` scoped " +
      "to THIS file's own library (from `figma_file_url`) to enumerate all component sets — never stop at the " +
      "capped page listing. Read the FULL variable collection (`figma_token_collection`) AND the text/color " +
      "STYLES. Fetch VARIABLES + STYLES (not code generation). Extract the COMPLETE token set and NEVER guess " +
      "or approximate a value — if a value truly can't be read, OMIT it and note it, never fabricate a value.\n\n" +
      "For `design_source: github` (a repository imported into this project), the repo's own files ARE " +
      "the source: scan them for the design system — read its existing token definitions (CSS variables, " +
      "Tailwind/theme config, SCSS/JS token files) and its component library, and reconcile them into the " +
      "configured `token_file` and inventory. Do not fetch anything remotely; read the files on disk.\n\n" +
      "1. Extract every design token and variable from the source into the configured `token_file`.\n" +
      "   For `styling: tailwind`, ALSO author a CURATED, SEMANTIC `tailwind.config.js` `theme.extend` that " +
      "maps IDIOMATIC Tailwind scale names to those tokens — colors `primary/secondary/success/danger/warning/" +
      "info` + `neutral.{100,300,600,900,muted}` + `text.{DEFAULT,muted}` + brand ramps; the `spacing` scale; " +
      "`borderRadius` (sm/DEFAULT/md/lg); `boxShadow` (DEFAULT/md); `borderWidth` (1); `fontFamily` (base/sans/" +
      "mono); `fontSize` (body/h1…, each with its lineHeight); `opacity.disabled` — so components use CLEAN " +
      "classes like `bg-primary text-danger border-1 border-neutral-300 rounded shadow-md p-3 text-body`, NEVER " +
      "a raw `bg-[var(--…)]` dump and NEVER Tailwind's hardcoded defaults. This semantic theme is the single " +
      "biggest driver of component fidelity.\n" +
      "2. Detect the design system's PUBLIC components and write `.sdd-de/components.json` — a JSON " +
      "array of objects `{ \"name\": string, \"level\": \"atom\"|\"molecule\"|\"organism\", " +
      "\"description\": string, \"variants\"?: string[], \"figmaNodeId\"?: string, \"componentKey\"?: string }`, " +
      "ordered tokens → atoms → molecules → organisms.\n\n" +
      "   RECORD THE FIGMA REFERENCE on every entry (this is required — build and verify look it up to fetch " +
      "the authoritative design and validate against it, without asking the user): set `figmaNodeId` to the " +
      "component set's node id and, when available, `componentKey` to its durable library key. You already have " +
      "these from the enumeration (Desktop Bridge `figma.root.children`, or `search_design_system` scoped to " +
      "this file's own library, or the node you read). Never leave a component without at least a `figmaNodeId`.\n\n" +
      "   COLLAPSE VARIANTS — do NOT emit one entry per variant:\n" +
      "   - A Figma COMPONENT_SET is ONE component: emit a single entry named after the set and record its " +
      "variant AXIS names in `variants` (e.g. `{ \"name\": \"button\", \"variants\": [\"type\", \"size\"] }`), " +
      "not one entry per variant.\n" +
      "   - Components whose names share a slash-separated prefix (e.g. `form-item/horizontal/input`, " +
      "`form-item/vertical/select`) are variants of ONE component: emit a single entry named after the shared " +
      "base (`form-item`) with the DIFFERING path segments as its axes (`\"variants\": [\"orientation\", \"control\"]`), " +
      "NOT one entry per combination.\n" +
      "   EXCLUDE internal sub-components and styles — DROP a node when it is: underscore-prefixed " +
      "(`_carousel-item`) — a private part; dot-prefixed (`.largeTitle`) — a text/color STYLE, which belongs in the " +
      "token file as a typography/color token, NOT the component inventory; or used ONLY as a child inside ONE " +
      "other component and never placed on its own (a sub-part like navbar-brand/navbar-collapse of `navbar`, " +
      "carousel-item of `carousel`, dropdown-menu-item of `dropdown-menu`) — fold it into its parent, don't list it " +
      "separately. The `components/` FOLDER prefix is NOT by itself an internal marker — judge by composition. " +
      "Detect the public, standalone design-system components only.\n\n" +
      "Do NOT implement the components yet — this stage only extracts tokens and detects the inventory.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "components",
    title: "Components",
    summary:
      "Choose to build every detected component at once, or one by one. Each is generated in your framework and language using the extracted tokens.",
    kind: "components",
    gated: true,
    allowedTools: ["Read", "Write", "Edit", "Bash"],
  },
  {
    id: "visual-verify",
    title: "Visual verify",
    summary:
      "/visual-verify — compare the implementation to the spec across viewports; a11y audit; list discrepancies.",
    kind: "verify",
    gated: true,
    // The skill writes specs/<component>/visual-verify-report.md — surface the
    // newest one in the approval gate so this stage can be reviewed + approved.
    artifactGlob: "visual-verify-report.md",
    promptTemplate:
      "/visual-verify\n\nRun the visual-verify skill: compare the live implementation to the spec across 375/768/1440px, check every token, variant, and state, run the accessibility audit, and report discrepancies.",
    allowedTools: ["Read", "Bash"],
  },
  {
    id: "sync",
    title: "Sync",
    summary:
      "/sync-tokens — reconcile the token-decisions log and token files with the decisions made during implementation.",
    kind: "agent",
    gated: false,
    // Write the decisions log to `.sdd-de/design-decisions.md`, NOT `design.md`:
    // on case-insensitive macOS `design.md` is the same file as the Google-format
    // `DESIGN.md`, so writing there would clobber the manifest.
    promptTemplate:
      "/sync-tokens\n\nRun the sync-tokens skill: reconcile token files with the implementation and " +
      "maintain the token-decisions log at `.sdd-de/design-decisions.md` (NOT `design.md` — on macOS that " +
      "collides with the Google-format DESIGN.md). No undocumented deviations.",
    allowedTools: ["Read", "Write", "Edit"],
  },
  {
    id: "design-manifest",
    title: "Design manifest",
    summary:
      "/design-doc — generate DESIGN.md: the tokens, component contracts, and conventions any AI coding agent reads to build on-brand screens. Review and approve before publishing.",
    kind: "manifest",
    gated: true,
    // The design-doc skill writes DESIGN.md at the project root (reader also
    // tolerates .sdd-de/design.md). Surface it for the approval gate.
    artifact: "DESIGN.md",
    promptTemplate:
      "/design-doc\n\nRun the design-doc skill: generate and validate DESIGN.md with @google/design.md, capturing every design token, component contract (props, states, tokens consumed), and convention as the AI hand-off file. Install @google/design.md if it is missing. Do not modify the components themselves.",
    allowedTools: ["Read", "Write", "Edit", "Bash"],
  },
  {
    id: "commit",
    title: "Commit & publish",
    summary:
      "Optional — keep everything local, or connect a GitHub repo and publish from here using your own git/gh.",
    kind: "agent",
    gated: false,
    optional: true,
    promptTemplate:
      "/commit\n\nRun the commit skill: commit the changes and open a PR whose description is the component spec, with the Figma link and QA screenshots. No direct pushes to main.",
    allowedTools: ["Read", "Bash"],
  },
];
