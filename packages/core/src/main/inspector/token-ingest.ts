import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  canonicalFromCssCustomProperties,
  canonicalFromScssVariables,
  canonicalFromThemeObject,
  type TokenIngestFormat,
  type TokenIngestResult,
} from "@vortspec/core/canonical-ingest";
import { canonicalFromDtcgExport } from "@vortspec/core/canonical-tokens";
import { readTsThemeObject } from "@vortspec/core/theme-object-reader";
import { detectTokenFormat, type TokenFormat } from "@vortspec/core/token-writers";
import { isConsumeSource } from "@vortspec/core/setup";
import type { DesignTokenDocument } from "@vortspec/core/design-tokens";
import type { TokenEmitSummary } from "@vortspec/core/token-emit-ledger";
import { writeCanonicalTokens } from "./canonical-tokens";
import { emitAfterIngest } from "./token-emit";
import { resolveCssImports } from "./css-imports";
import { readProjectConfig } from "../workspace/config-manager";

/**
 * The non-design-tool ingest — OpenSpec change: agentic-design-system, task 7.10.
 *
 * The fs half of reading a project's OWN token file (CSS custom properties, SCSS, a JS/TS theme
 * object, a JSON token file) as the design source, producing the same `.vortspec/tokens.json` a
 * Figma read produces. Every shape decision is pure and lives in `shared/canonical-ingest.ts`; this
 * module resolves the file, routes by format, and writes the artifact.
 *
 * Nothing here writes to the token file. That is not incidental — for a CONSUME source
 * (`enterprise` / `library`) `token_file` POINTS AT the vendor's or client's real source rather than
 * naming a VortSpec-owned copy, so ingest is a read-only projection by construction: the only file
 * this module writes is VortSpec's own artifact. `emitTokenFiles` enforces the other half of that
 * rule, refusing to emit over a consumed source at all.
 */

/**
 * The result shapes live in `shared/canonical-ingest.ts` (in zod) now that the ingest is reachable
 * over IPC and every channel response is validated — task 7.14. Re-exported so existing importers
 * are untouched.
 */
export type { TokenIngestFormat, TokenIngestResult } from "@vortspec/core/canonical-ingest";

/**
 * Read the project's token file and write the canonical artifact.
 *
 * Never throws for a missing or unreadable source — a project may legitimately have no token file
 * yet, and a failed ingest must degrade to "nothing to read" rather than break the caller. It DOES
 * report every dropped name, for the same reason `syncVariablesToCache` does: a token that vanishes
 * between the source and the artifact while the run reports success is the silent loss this whole
 * change exists to remove.
 */
export async function ingestTokensFromProject(
  projectPath: string,
  options: { generatedAt?: string } = {},
): Promise<TokenIngestResult> {
  const config = await readProjectConfig(projectPath);
  const tokenFile = config?.tokenFile ?? null;
  const readOnly = isConsumeSource(config?.designSource);
  const empty = { ok: false, tokenFile, format: null, count: 0, dropped: [], files: [], readOnly };
  if (!tokenFile)
    return {
      ...empty,
      message:
        "No token_file in .sdd-de/project.yaml — VortSpec has nothing to read the design system from.",
    };

  const meta = {
    // The provenance says which INGEST produced it, and a consumed library is a materially different
    // origin from the project's own stylesheet even when the file format is identical — a reader
    // deciding whether the artifact may be written back needs to tell them apart.
    source: readOnly ? "library" : sourceNameFor(detectTokenFormat(tokenFile)),
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
  };

  const read = await readSource(projectPath, tokenFile);
  if (!read)
    return {
      ...empty,
      message: `Couldn't read ${tokenFile}. Check that the path in .sdd-de/project.yaml exists.`,
    };

  const built = buildCanonical(read, meta, config?.designSource);
  if (!built)
    return {
      ...empty,
      format: read.format,
      files: read.files,
      message: `${tokenFile} didn't contain any design tokens VortSpec could read.`,
    };

  await writeCanonicalTokens(projectPath, built.document);
  // Emit as the tail of the ingest (task 7.14) — passing what we just READ, so the emit can refuse
  // to write back over its own source. On this path it almost always does refuse: `token_file` is
  // the design source here, and the derived artifact is `.vortspec/tokens.json`. For a CONSUME
  // source it comes back `read-only` instead, which says the same thing more precisely.
  const emit = await emitAfterIngest(projectPath, { ingestedFrom: tokenFile });
  const count = countTokens(built.document);
  return {
    ok: true,
    tokenFile,
    format: read.format,
    count,
    dropped: built.dropped,
    files: read.files,
    readOnly,
    emit,
    message: ingestMessage({
      count,
      tokenFile,
      format: read.format,
      dropped: built.dropped,
      readOnly,
      emit,
    }),
  };
}

/** How many dropped names to spell out before summarising the rest — matches the Figma sync. */
const DROPPED_NAMES_SHOWN = 5;

/**
 * The human sentence for an ingest. Pure + exported so the reporting of a dropped token is testable
 * without touching disk.
 */
export function ingestMessage(opts: {
  count: number;
  tokenFile: string;
  format: TokenIngestFormat;
  dropped: readonly string[];
  readOnly: boolean;
  emit?: TokenEmitSummary;
}): string {
  const { count, tokenFile, format, dropped, readOnly, emit } = opts;
  const parts = [
    `Read ${count} design token${count === 1 ? "" : "s"} from ${tokenFile} (${format})` +
      `${readOnly ? " — projected read-only; the consumed source is never written." : "."}`,
  ];
  if (dropped.length) {
    const shown = dropped.slice(0, DROPPED_NAMES_SHOWN).join(", ");
    const rest = dropped.length - DROPPED_NAMES_SHOWN;
    parts.push(
      `${dropped.length} token${dropped.length === 1 ? "" : "s"} couldn't be written as a` +
        ` design token because the name collides with another token's group: ` +
        `${shown}${rest > 0 ? `, +${rest} more` : ""}.`,
    );
  }
  // As in the Figma sync: an emit that needs a decision says so in the sentence the user reads.
  // `read-only` is suppressed here only because the head sentence already said it.
  if (emit && !["up-to-date", "written", "read-only"].includes(emit.status)) parts.push(emit.message);
  return parts.join(" ");
}

interface SourceRead {
  format: TokenIngestFormat;
  text: string;
  /** Parsed JSON, when the file was JSON — parsed once, here, so the router need not re-parse. */
  json?: unknown;
  files: string[];
}

/**
 * Read the token file, following a CSS `@import` chain.
 *
 * The chain matters most for exactly the case this task is about: a consumed library's token file
 * usually declares almost nothing itself and `@import`s the vendor's theme, so reading only the
 * entry file would produce an artifact with zero tokens and report it as a success.
 */
async function readSource(projectPath: string, tokenFile: string): Promise<SourceRead | null> {
  const format = detectTokenFormat(tokenFile);
  if (format === "css" || format === "scss") {
    const resolved = await resolveCssImports(projectPath, tokenFile);
    if (!resolved.files.length) return null;
    return { format, text: resolved.css, files: resolved.files };
  }
  const text = await readFile(join(projectPath, tokenFile), "utf8").catch(() => null);
  if (text === null) return null;
  if (format === "json") {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    // A JSON file that already carries `$value` leaves IS a DTCG document. Persisting it unmodified
    // (task 7.2) beats re-deriving it: the file's own `$type`s, descriptions and aliases are better
    // information than anything inferred from its values.
    return { format: looksLikeDtcg(json) ? "dtcg" : "json", text, json, files: [tokenFile] };
  }
  return { format: "ts", text, files: [tokenFile] };
}

function buildCanonical(
  read: SourceRead,
  meta: { source: string; generatedAt?: string },
  designSource: string | undefined,
): { document: DesignTokenDocument; dropped: string[] } | null {
  // A consumed library's tokens are labelled with the source they came from, so the Inspector and
  // the emitters can say whose design system a token belongs to.
  const options = isConsumeSource(designSource) ? { collection: "Consumed" } : {};
  switch (read.format) {
    case "css":
      return canonicalFromCssCustomProperties(read.text, meta, options);
    case "scss":
      return canonicalFromScssVariables(read.text, meta, options);
    case "dtcg": {
      const document = canonicalFromDtcgExport(read.json, meta);
      return document ? { document, dropped: [] } : null;
    }
    case "json":
      return canonicalFromThemeObject(read.json, meta, options);
    case "ts": {
      const object = readTsThemeObject(read.text);
      return object ? canonicalFromThemeObject(object, meta, options) : null;
    }
  }
}

/** Whether a parsed JSON file is already a DTCG document — i.e. any node carries a `$value`. */
function looksLikeDtcg(data: unknown, depth = 0): boolean {
  if (depth > 8 || !data || typeof data !== "object" || Array.isArray(data)) return false;
  const obj = data as Record<string, unknown>;
  if ("$value" in obj) return true;
  return Object.entries(obj).some(([key, child]) => !key.startsWith("$") && looksLikeDtcg(child, depth + 1));
}

/** Tokens in the artifact — a `$value`-carrying node, counted the way every reader identifies one. */
function countTokens(node: unknown, depth = 0): number {
  if (depth > 32 || !node || typeof node !== "object" || Array.isArray(node)) return 0;
  const obj = node as Record<string, unknown>;
  if ("$value" in obj) return 1;
  let total = 0;
  for (const [key, child] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    total += countTokens(child, depth + 1);
  }
  return total;
}

function sourceNameFor(format: TokenFormat): string {
  return format === "ts" ? "theme-object" : format;
}
