/**
 * Per-component readiness + convergence (OpenSpec change: light-design-system, group 4). The shared
 * contract (`extract-design-system` → `components.json`) is the SINGLE identity source both tracks
 * build to: the fast light track (→ palette) and the background framework track (→ 7-step cycle). This
 * module is the pure authority for:
 *   - readiness: a component is `light-only` until its framework version exists AND every variant has
 *     been harvested into a stand-in — then `framework-ready`.
 *   - convergence: the framework component's identity (name + variants + props) MUST match the
 *     contract; identity converges by construction, and this asserts it (catches drift early).
 *   - the report the soft gate (group 5) and the Playground badges (4.4) read.
 *
 * Pure + framework-free (mirrors lite-manifest.ts / harvest.ts). The two-track orchestration (running
 * the agents) and the Playground UI are wiring layered on top; they consume this model.
 */
import type { Readiness } from "./lite-manifest";

/** The contract identity for one component — the authority both tracks are checked against. */
export interface ContractIdentity {
  name: string;
  variants: string[];
  props?: { name: string; type: string; default?: string }[];
}

/** What the background framework track has produced for a component (absent ⇒ not built yet). */
export interface FrameworkStatus {
  /** The framework component file exists. */
  exists: boolean;
  /** Variants harvested into stand-ins so far. */
  harvestedVariants: string[];
  /** The identity parsed from the framework component, for the convergence check (absent until built). */
  identity?: ContractIdentity;
}

const NO_STATUS: FrameworkStatus = { exists: false, harvestedVariants: [] };

/** A component with no declared variants still has one implicit "default" cell. */
function effectiveVariants(variants: string[]): string[] {
  return variants.length > 0 ? variants : ["default"];
}

/**
 * Readiness transition (4.3): `framework-ready` iff the framework component exists AND every (effective)
 * contract variant has been harvested — otherwise `light-only`. This is the same rule the lite manifest
 * encodes locally from its stand-ins; here it is computed from the contract + the framework track's status.
 */
export function computeReadiness(contract: ContractIdentity, fw: FrameworkStatus = NO_STATUS): Readiness {
  if (!fw.exists) return "light-only";
  const harvested = new Set(fw.harvestedVariants);
  return effectiveVariants(contract.variants).every((v) => harvested.has(v)) ? "framework-ready" : "light-only";
}

/**
 * Convergence assertion (4.5): the framework component's identity must match the contract. Returns the
 * violations (empty ⇒ converged). Nothing to compare until the framework component exists with a parsed
 * identity, so that case is vacuously converged.
 */
export function convergenceIssues(contract: ContractIdentity, fw: FrameworkStatus = NO_STATUS): string[] {
  if (!fw.exists || !fw.identity) return [];
  const f = fw.identity;
  const issues: string[] = [];
  if (f.name !== contract.name) issues.push(`name: framework "${f.name}" ≠ contract "${contract.name}"`);

  const cv = new Set(contract.variants);
  const fv = new Set(f.variants);
  for (const v of contract.variants) if (!fv.has(v)) issues.push(`variant "${v}" missing in framework`);
  for (const v of f.variants) if (!cv.has(v)) issues.push(`variant "${v}" extra in framework`);

  const cProps = new Map((contract.props ?? []).map((p) => [p.name, p]));
  const fProps = new Map((f.props ?? []).map((p) => [p.name, p]));
  for (const [name, cp] of cProps) {
    const fp = fProps.get(name);
    if (!fp) issues.push(`prop "${name}" missing in framework`);
    else if (fp.type !== cp.type) issues.push(`prop "${name}" type: framework "${fp.type}" ≠ contract "${cp.type}"`);
  }
  for (const name of fProps.keys()) if (!cProps.has(name)) issues.push(`prop "${name}" extra in framework`);
  return issues;
}

export interface ComponentReadiness {
  name: string;
  readiness: Readiness;
  converged: boolean;
  convergenceIssues: string[];
}

export interface ReadinessReport {
  components: ComponentReadiness[];
  /** The light palette is usable the moment the contract exists — independent of framework readiness. */
  paletteUsable: boolean;
  /** Names of components still `light-only` — what the Playground marks as "catching up". */
  catchingUp: string[];
  /** Names of components whose framework identity has drifted from the contract (should be empty). */
  diverged: string[];
}

/**
 * Build the readiness report for the whole contract (4.4/4.6). `paletteUsable` is true as soon as the
 * contract has components — the light shelf never waits on the framework track.
 */
export function buildReadinessReport(contract: ContractIdentity[], status: Record<string, FrameworkStatus> = {}): ReadinessReport {
  const components: ComponentReadiness[] = contract.map((c) => {
    const fw = status[c.name] ?? NO_STATUS;
    const issues = convergenceIssues(c, fw);
    return { name: c.name, readiness: computeReadiness(c, fw), converged: issues.length === 0, convergenceIssues: issues };
  });
  return {
    components,
    paletteUsable: contract.length > 0,
    catchingUp: components.filter((c) => c.readiness === "light-only").map((c) => c.name),
    diverged: components.filter((c) => !c.converged).map((c) => c.name),
  };
}

/**
 * The soft gate's per-page check (feeds group 5): which of a page's used components are NOT yet
 * `framework-ready` (i.e. block a compile to shippable framework code). Empty ⇒ the page can compile.
 */
export function compileBlockers(usedComponents: string[], report: ReadinessReport): string[] {
  const ready = new Set(report.components.filter((c) => c.readiness === "framework-ready").map((c) => c.name));
  return [...new Set(usedComponents)].filter((name) => !ready.has(name));
}
