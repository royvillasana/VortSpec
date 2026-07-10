import { z } from "zod";
import { execFileSafe } from "../util/exec";
import { getGithubAuth, parseGithubUrl } from "../git/github";
import { listThreads, setMessageNotified } from "./comment-store";
import type { CommentCollaborator, CommentThread, CommentMessage, NotifyResult } from "@vortspec/core/comment";

/**
 * GitHub mentions + notification for run-canvas comments (change:
 * run-canvas-comments, Phase 3).
 *
 * VortSpec runs no server, so it can't send email — it leverages **GitHub's**
 * notifications, authenticated as the user (their own `gh`, same model as "your
 * own Claude Code"). A comment that @mentions collaborators is posted to a GitHub
 * surface that emails on @mention: the branch's **open PR** if one exists, else a
 * rolling **"VortSpec review comments"** issue. No new credentials; args are always
 * arrays (never a shell string). Every path degrades to a fix-it — never throws.
 */

const ISSUE_TITLE = "VortSpec review comments";
const ISSUE_INTRO =
  "Design-review comments left in the VortSpec Run canvas. Each comment links back to the exact section.";

/** Run `gh` and JSON-parse its stdout, or null on any failure (never throws). */
async function ghJson(cwd: string, args: string[]): Promise<unknown> {
  const r = await execFileSafe("gh", args, { cwd, timeoutMs: 20_000 });
  if (r.spawnError || r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

const ghUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
});
const repoViewSchema = z.object({ nameWithOwner: z.string() });
const prViewSchema = z.object({ number: z.number(), url: z.string(), state: z.string() });
const issueListSchema = z.array(z.object({ number: z.number(), url: z.string() }));

/**
 * The repo's @mention candidates: collaborators (needs push access) with a
 * fallback to contributors. Empty when gh is unavailable / not a GitHub repo.
 */
export async function collaborators(projectPath: string): Promise<CommentCollaborator[]> {
  const toList = (raw: unknown): CommentCollaborator[] | null => {
    const parsed = z.array(ghUserSchema).safeParse(raw);
    if (!parsed.success) return null;
    return parsed.data.map((u) => ({ login: u.login, name: u.name ?? null, avatar: u.avatar_url ?? null }));
  };
  const collab = toList(await ghJson(projectPath, ["api", "repos/{owner}/{repo}/collaborators", "--paginate"]));
  if (collab && collab.length) return collab;
  // Collaborators needs push access; contributors is public-readable.
  return toList(await ghJson(projectPath, ["api", "repos/{owner}/{repo}/contributors", "--paginate"])) ?? [];
}

/** The GitHub surface to post a mention to — prefer an open PR, else the rolling issue. */
export function chooseSurface(
  pr: { number: number; state: string } | null,
  issues: { number: number }[],
): { kind: "pr"; number: number } | { kind: "issue"; number: number } | { kind: "create" } {
  if (pr && pr.state === "OPEN") return { kind: "pr", number: pr.number };
  if (issues.length > 0) return { kind: "issue", number: issues[0].number };
  return { kind: "create" };
}

/** The GitHub comment body: the message (its @handles notify) + a link back to the section. */
export function buildNotifyBody(thread: CommentThread, message: CommentMessage): string {
  const where = thread.anchor.route ? `${thread.anchor.label} (${thread.anchor.route})` : thread.anchor.label;
  const file = thread.anchor.file ? ` — \`${thread.anchor.file}\`` : "";
  return `${message.body}\n\n— on **${where}**${file} in the VortSpec Run canvas.`;
}

/** Post the body to the chosen surface; returns a receipt or a fix-it reason. */
async function postToSurface(
  cwd: string,
  body: string,
): Promise<{ ok: true; issue: number; url: string } | { ok: false; reason: string }> {
  const pr = prViewSchema.safeParse(await ghJson(cwd, ["pr", "view", "--json", "number,url,state"]));
  const issues = issueListSchema.safeParse(
    await ghJson(cwd, ["issue", "list", "--state", "open", "--search", `${ISSUE_TITLE} in:title`, "--json", "number,url", "--limit", "1"]),
  );
  const surface = chooseSurface(pr.success ? pr.data : null, issues.success ? issues.data : []);

  if (surface.kind === "pr") {
    const r = await execFileSafe("gh", ["pr", "comment", String(surface.number), "--body", body], { cwd, timeoutMs: 30_000 });
    if (r.code === 0) return { ok: true, issue: surface.number, url: parseGithubUrl(r.stdout) ?? (pr.success ? pr.data.url : "") };
    return { ok: false, reason: r.stderr.trim() || "Could not comment on the pull request." };
  }
  if (surface.kind === "issue") {
    const url = issues.success ? issues.data[0].url : "";
    const r = await execFileSafe("gh", ["issue", "comment", String(surface.number), "--body", body], { cwd, timeoutMs: 30_000 });
    if (r.code === 0) return { ok: true, issue: surface.number, url: parseGithubUrl(r.stdout) ?? url };
    return { ok: false, reason: r.stderr.trim() || "Could not comment on the review-comments issue." };
  }
  const r = await execFileSafe("gh", ["issue", "create", "--title", ISSUE_TITLE, "--body", `${ISSUE_INTRO}\n\n${body}`], { cwd, timeoutMs: 30_000 });
  if (r.code !== 0) return { ok: false, reason: r.stderr.trim() || "Could not create the review-comments issue." };
  const url = parseGithubUrl(r.stdout) ?? "";
  const num = Number(/\/issues\/(\d+)/.exec(url)?.[1] ?? 0);
  return { ok: true, issue: num, url };
}

/**
 * Notify the @mentioned collaborators of a message via GitHub, storing the receipt
 * on the message. Degrades to a `{ notified: false, reason }` fix-it (never throws)
 * when there are no mentions, gh is missing / signed out, or there's no GitHub remote.
 */
export async function notify(projectPath: string, threadId: string, messageId: string): Promise<NotifyResult> {
  try {
    const thread = (await listThreads(projectPath)).find((t) => t.id === threadId);
    const message = thread?.messages.find((m) => m.id === messageId);
    if (!thread || !message) return { notified: false, reason: "That comment could not be found." };
    if (message.mentions.length === 0) return { notified: false, reason: "No @mentions to notify." };

    const auth = await getGithubAuth();
    if (!auth.cliInstalled)
      return { notified: false, reason: "Install the GitHub CLI (gh) to notify @mentions — the comment is saved locally." };
    if (!auth.authenticated)
      return { notified: false, reason: "Sign in to GitHub (`gh auth login`) to notify @mentions — the comment is saved locally." };

    const repo = repoViewSchema.safeParse(await ghJson(projectPath, ["repo", "view", "--json", "nameWithOwner"]));
    if (!repo.success)
      return {
        notified: false,
        reason: "This project has no GitHub remote — the comment is saved locally; add a remote to notify @mentions.",
      };

    const result = await postToSurface(projectPath, buildNotifyBody(thread, message));
    if (!result.ok) return { notified: false, reason: result.reason };

    await setMessageNotified(projectPath, threadId, messageId, { github: { issue: result.issue, url: result.url } });
    return { notified: true, url: result.url };
  } catch {
    return { notified: false, reason: "Could not notify via GitHub — the comment is saved locally." };
  }
}
