/**
 * Run Doctor helpers (change: run-doctor).
 *
 * Pure logic for the "Fix with Claude" flow: turn a captured failure into a
 * focused diagnostic prompt for a gated Claude Code run, and resolve the
 * failing file from a runtime error's source URL. Kept pure so it's testable.
 */

export interface DoctorContext {
  kind: "startup" | "runtime";
  /** The error message / stderr tail / stack. */
  error: string;
  /** Project-relative failing file, when known. */
  file?: string | null;
  /** The dev script that was run (e.g. `dev`). */
  script?: string | null;
}

/** Resolve a project-relative file path from a runtime error's source URL. */
export function relFileFromSource(source: string | undefined): string | null {
  if (!source) return null;
  try {
    const u = new URL(source);
    const p = u.pathname.replace(/^\/+/, "").split("?")[0];
    return p || null;
  } catch {
    const p = source.split("?")[0].replace(/^\/+/, "");
    return p || null;
  }
}

/** A focused prompt for the gated Claude Code run that fixes the failure. */
export function buildDoctorPrompt(ctx: DoctorContext): string {
  return [
    `The project's app failed to ${ctx.kind === "startup" ? "start" : "run"} in the VortSpec live preview${
      ctx.script ? ` (dev script: \`${ctx.script}\`)` : ""
    }.`,
    ctx.file ? `The error points at \`${ctx.file}\`.` : "",
    ``,
    `Error:`,
    "```",
    ctx.error.slice(0, 2000),
    "```",
    ``,
    `Diagnose the root cause and apply the MINIMAL fix to the project so the app runs. Common causes: missing or misconfigured environment variables, a missing dependency, a wrong config, or a framework/version mismatch. Read the relevant files (package.json, config, the failing file) before changing anything, and do not touch unrelated code.`,
    ``,
    `CRITICAL — never fabricate secrets. Do NOT invent API keys, URLs, database connection strings, or any credential. If the fix requires values only the user can provide (e.g. a Supabase URL and key, a database URL), do NOT guess: ensure the required variables exist in \`.env\` (creating it from \`.env.example\` if needed) with clear placeholder names, and clearly state which variables the user must fill in and where to obtain them.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
