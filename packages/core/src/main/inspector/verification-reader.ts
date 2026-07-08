import { join, basename, dirname } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  FindingSeverity,
  VerificationFinding,
  VerificationResult,
} from "@vortspec/core/inspector";

/**
 * Aggregate verification findings from the project's report files — the
 * visual-verify report and any adversarial-review report under specs/ — into a
 * flat, severity-tagged list for the Verification screen. Best-effort Markdown
 * scan of our own report format; degrades to fewer findings on unfamiliar shapes.
 */

const BACKTICK = String.fromCharCode(96);
const CODE_SPAN = new RegExp(BACKTICK, "g");

async function findReports(
  specsRoot: string,
): Promise<{ path: string; group: "visual" | "adversarial" }[]> {
  const out: { path: string; group: "visual" | "adversarial" }[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === "visual-verify-report.md") out.push({ path: full, group: "visual" });
      else if (/adversarial.*\.md$/i.test(entry.name)) out.push({ path: full, group: "adversarial" });
    }
  }
  await walk(specsRoot);
  return out;
}

/** First inline code span that looks like a path or token (has a dot or slash). */
function firstRef(block: string): string | undefined {
  const parts = block.split(BACKTICK);
  // Odd-indexed segments are the contents of code spans.
  for (let i = 1; i < parts.length; i += 2) {
    const s = parts[i];
    if (/[./]/.test(s) && s.length < 60) return s;
  }
  const src = block.match(/\b(src\/[\w./-]+)/);
  return src?.[1];
}

/** Strip markdown emphasis/list markers and collapse to a short detail line. */
function cleanDetail(block: string): string {
  const line = block
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("|"));
  if (!line) return "";
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(CODE_SPAN, "")
    .slice(0, 260)
    .trim();
}

/** Index just past the next 2-3 hash header after `from`, else end of string. */
function nextHeader(md: string, from: number): number {
  const idx = md.slice(from + 1).search(/\n#{2,3}\s/);
  return idx < 0 ? md.length : from + 1 + idx;
}

function parseFindings(
  md: string,
  group: "visual" | "adversarial",
  component: string,
  reportPath: string,
): VerificationFinding[] {
  const findings: VerificationFinding[] = [];
  const push = (
    rawId: string,
    title: string,
    detail: string,
    severity: FindingSeverity,
    block: string,
  ): void => {
    const status: "open" | "resolved" = /resolved|passed/i.test(block) ? "resolved" : "open";
    findings.push({
      id: component + ":" + rawId,
      rawId,
      component,
      group,
      severity,
      title: title.trim().replace(/\s+·.*$/, ""),
      detail,
      ref: firstRef(block),
      status,
      reportPath,
    });
  };

  // Discrepancy headers (blocking -> error unless resolved).
  const dRe = /^###\s+(D\w+)\b[ \t]*[—:-]?[ \t]*(.*)$/gm;
  const dMatches = [...md.matchAll(dRe)];
  for (let i = 0; i < dMatches.length; i++) {
    const m = dMatches[i];
    const start = m.index ?? 0;
    const end =
      i + 1 < dMatches.length ? (dMatches[i + 1].index ?? md.length) : nextHeader(md, start);
    const block = md.slice(start, end);
    push(m[1], m[2] || "Discrepancy", cleanDetail(md.slice(start + m[0].length, end)), "error", block);
  }

  // Observation bullets (non-blocking -> info).
  for (const m of md.matchAll(/^-\s+\*\*(O[\w-]*)\b[ \t]*[—:-]?[ \t]*([^*]+?)\*\*[ \t]*(.*)$/gm)) {
    push(m[1], m[2], (m[3] || "").replace(CODE_SPAN, "").slice(0, 260).trim(), "info", m[0]);
  }

  return findings;
}

export async function getVerification(projectPath: string): Promise<VerificationResult> {
  const specsRoot = join(projectPath, "specs");
  const reports = await findReports(specsRoot);
  const findings: VerificationFinding[] = [];
  for (const { path, group } of reports) {
    const md = await readFile(path, "utf8").catch(() => "");
    if (!md) continue;
    const rel = path.slice(projectPath.length + 1);
    const dir = dirname(path);
    const component = dir === specsRoot ? "system" : basename(dir);
    findings.push(...parseFindings(md, group, component, rel));
  }
  return { findings };
}
