import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  CANONICAL_TOKENS_PATH,
  parseDesignTokenDocument,
  type DesignTokenDocument,
} from "@vortspec/core/design-tokens";

/**
 * The fs half of the canonical token artifact (`.vortspec/tokens.json`) — OpenSpec change:
 * agentic-design-system, task 7.2. Every decision about the artifact's SHAPE lives in
 * `shared/canonical-tokens.ts`, which is pure; this module only moves it to and from disk.
 */

/**
 * Write the canonical artifact. Pretty-printed with a trailing newline, matching the other
 * `.vortspec/` caches: the file is read in diffs and reviewed by hand, and a one-line JSON blob
 * would make every token change look like the whole file changed.
 */
export async function writeCanonicalTokens(
  projectPath: string,
  document: DesignTokenDocument,
): Promise<void> {
  await mkdir(join(projectPath, ".vortspec"), { recursive: true });
  await writeFile(
    join(projectPath, CANONICAL_TOKENS_PATH),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Read the canonical artifact, or null when it is missing or unreadable.
 *
 * Null rather than a throw because a project that predates this change simply has no
 * `tokens.json` yet, and "not there" must degrade to the older `figma-variables.json` path rather
 * than fail the read — the artifact is being adopted alongside that cache, not in place of it
 * (task 7.13 retires it).
 */
export async function readCanonicalTokens(
  projectPath: string,
): Promise<DesignTokenDocument | null> {
  let raw: string;
  try {
    raw = await readFile(join(projectPath, CANONICAL_TOKENS_PATH), "utf8");
  } catch {
    return null;
  }
  try {
    return parseDesignTokenDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}
