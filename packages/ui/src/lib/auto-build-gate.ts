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
