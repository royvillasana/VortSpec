import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import {
  VALIDATION_DIR,
  buildValidationPagePrompt,
  buildValidationPages,
  canGenerateValidationPage,
  type ValidationComponent,
} from "@vortspec/core/validation-page";
import type { ComponentTier } from "@vortspec/core/relationship-graph";
import type { AuditReport } from "@vortspec/core/audit-report";
import { getInspectorComponents } from "./component-reader";
import { readProjectConfig } from "../workspace/config-manager";
import { runComponentCreationAudit } from "./audit-report";

/**
 * Generate the validation pages, audit against them, then clean up — OpenSpec change:
 * agentic-design-system, tasks 2b.4 and 2b.5.
 *
 * This is what makes audit A runnable on a project that has never had a screen, which is the whole
 * reason group 2b exists: components are built before screens, and that is when their token
 * discipline is cheapest to fix.
 *
 * The pages are REMOVED afterwards unless the caller keeps them, and the removal is in a `finally`.
 * A crashed audit that leaves generated files in someone's source tree is exactly the litter that
 * makes a tool feel unsafe to run — and the next `git status` would show files nobody wrote.
 */

export interface ValidationRunResult {
  /** Project-relative paths that were generated. */
  pages: string[];
  /** True when the pages were left in place at the caller's request. */
  kept: boolean;
  report: AuditReport | null;
  /**
   * Set when the framework has no deterministic generator: the prompt to run instead. The audit does
   * not run in that case — auditing pages that were never written would report a clean system that
   * was never examined.
   */
  prompt?: string;
  message: string;
}

/** The variant values a component actually exposes — the CVA convention: a prop named `variant`. */
function variantsOf(props: readonly { key: string; kind: string; options: string[] }[]): string[] {
  return props.find((prop) => prop.key.toLowerCase() === "variant" && prop.kind === "enum")?.options ?? [];
}

const TIERS = new Set(["atom", "molecule", "organism", "template"]);

/**
 * Run the component-creation audit against generated validation pages.
 *
 * `keep: true` leaves them committed as a reviewable "whole design system rendered" artifact — a
 * real answer to "show me everything", and a stable subject for a report rather than a moving one.
 */
export async function runValidationAudit(
  projectPath: string,
  options: { keep?: boolean; ranAt?: string } = {},
): Promise<ValidationRunResult> {
  const [config, comps] = await Promise.all([
    readProjectConfig(projectPath),
    getInspectorComponents(projectPath).catch(() => null),
  ]);
  const roster = comps?.components ?? [];

  if (roster.length === 0)
    return {
      pages: [],
      kept: false,
      report: null,
      message: "No components to validate yet — build a component first.",
    };

  const components: ValidationComponent[] = roster
    .filter((component) => component.file)
    .map((component) => ({
      name: component.name,
      file: component.file!,
      ...(TIERS.has(component.level ?? "") ? { tier: component.level as ComponentTier } : {}),
      variants: variantsOf(component.props ?? []),
    }));

  if (!canGenerateValidationPage(config?.framework ?? undefined)) {
    // No pages, so NO AUDIT. Auditing pages that were never written would report a clean design
    // system that nobody examined — the exact false pass the whole report shape guards against.
    return {
      pages: [],
      kept: false,
      report: null,
      prompt: buildValidationPagePrompt(components, config?.framework ?? undefined),
      message:
        `VortSpec has no deterministic validation-page generator for "${config?.framework ?? "(unset)"}". ` +
        `Run the returned prompt to generate the pages, then audit against them.`,
    };
  }

  const pages = buildValidationPages(components, config?.framework ?? undefined);
  const written: string[] = [];
  try {
    await mkdir(join(projectPath, VALIDATION_DIR), { recursive: true });
    for (const page of pages) {
      await writeFile(join(projectPath, page.path), page.contents, "utf8");
      written.push(page.path);
    }
    const report = await runComponentCreationAudit(projectPath, {
      ranAt: options.ranAt,
      validationPages: written,
    });
    return {
      pages: written,
      kept: options.keep === true,
      report,
      message: options.keep
        ? `Audited ${written.length} generated page(s) and kept them under ${VALIDATION_DIR}/ — commit them for a reviewable "whole design system rendered" artifact. Run the same audit against your own screens for contextual correctness; these pages are the floor, not the ceiling.`
        : `Audited ${written.length} generated page(s) and removed them. Run the same audit against your own screens once they exist — a generated page shows that components render, not that they are used correctly in context.`,
    };
  } finally {
    // In `finally` on purpose: a crashed audit must not leave generated files behind. Only what we
    // wrote is removed — never a directory a user happens to have.
    if (options.keep !== true) {
      for (const page of written) await rm(join(projectPath, page), { force: true });
      await rm(join(projectPath, VALIDATION_DIR), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
