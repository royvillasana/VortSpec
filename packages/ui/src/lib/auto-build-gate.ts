import { isConsumeSource } from "@vortspec/core/setup";
import { frameworkSupportError } from "@vortspec/core/framework-profiles";

/**
 * What the auto-builder should do for a project's configuration — as DATA, so the decision
 * is testable without a DOM (packages/ui runs vitest in a `node` environment).
 *
 * `claimProject` is the load-bearing field. Claiming marks the project permanently handled
 * for this session and stops the poll; a `setup-required` verdict must NOT claim, because
 * the whole point of telling the user to run `/setup` is that the next poll picks up the
 * corrected config and proceeds. Claiming there strands the project forever, which is the
 * bug this shape exists to make impossible to reintroduce silently.
 */
export type AutoBuildGate =
  | { kind: "consume"; claimProject: true }
  | { kind: "setup-required"; claimProject: false; reason: string }
  | { kind: "proceed"; claimProject: false };

export function autoBuildGate(cfg: { designSource?: string; framework?: string } | null): AutoBuildGate {
  // Consume sources CONSUME an existing component system — never auto-BUILD their components
  // (that would create VortSpec-owned look-alikes that drift from their source). Settled for
  // good, so it claims. (change: consume-component-libraries)
  if (isConsumeSource(cfg?.designSource)) return { kind: "consume", claimProject: true };
  // Generating without a known framework means generating React into whatever this project
  // actually is. Refuse to start — but stay re-checkable.
  const reason = frameworkSupportError(cfg?.framework);
  if (reason) return { kind: "setup-required", claimProject: false, reason };
  return { kind: "proceed", claimProject: false };
}

/** The two buckets the inspector reports, narrowed to what this decision needs. */
export interface BuildCandidates {
  /** The CODED roster — components with a file, or at least a roster entry. */
  components: { name: string; level?: string | null; status?: string }[];
  /** Figma components with no matching code component — designed, not yet built. */
  figmaOnly?: { name: string }[];
}

/**
 * What the auto-builder should build — OpenSpec change: agentic-design-system (follow-up).
 *
 * **`figmaOnly` is the load-bearing half for an extract source, and it used to be ignored.** The
 * gate read only `components.filter(status === "unknown")`, which is the CODED roster. A freshly
 * extracted Figma project has an EMPTY coded roster by definition — the components exist in Figma
 * and not yet in code, so the reconciler puts every one of them in `figmaOnly`. Auto-build therefore
 * saw zero candidates, concluded "design system not created yet", and polled forever while 51
 * components sat one field away.
 *
 * Observed exactly that on a real project: `components: []`, `figmaOnly: 51`, nothing ever built,
 * and no error anywhere — the same shape as the other silent-success failures in this area.
 *
 * Deduped by normalised name defensively. `figmaOnly` is already exclusive of the coded roster by
 * construction, but a component appearing in both would be built twice, and the second build would
 * overwrite the first — an expensive way to discover a reconciler bug.
 */
export function unbuiltComponents(comps: BuildCandidates | null): { name: string; level?: string | null }[] {
  if (!comps) return [];
  const coded = comps.components.filter((c) => c.status === "unknown");
  const seen = new Set(coded.map((c) => normName(c.name)));
  const designed = (comps.figmaOnly ?? [])
    .filter((f) => f.name.trim() && !seen.has(normName(f.name)))
    // No `level`: Figma does not record an atomic tier. `chunkByLevel` sorts unknown levels last,
    // which is the right default — a tier the roster does not know must not fake one.
    .map((f) => ({ name: f.name, level: null }));
  return [...coded, ...designed];
}

function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
