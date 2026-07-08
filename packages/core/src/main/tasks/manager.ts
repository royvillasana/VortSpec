import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { IssueType, TaskResult } from "@vortspec/core/task";
import { createJiraIssue } from "./jira";
import { linkIssue } from "./link-store";

/**
 * "The spec is the story": create a Jira issue whose body is a VortSpec spec, and
 * link the created issue to the component/screen `ref`. The spec is read locally;
 * the issue is created via the user's own Jira CLI.
 */
export async function createIssueFromSpec(req: {
  projectPath: string;
  project: string;
  type: IssueType;
  specPath: string;
  ref: string;
}): Promise<TaskResult> {
  const body = await readFile(join(req.projectPath, req.specPath), "utf8").catch(() => null);
  if (body === null) return { ok: false, message: `Couldn't read the spec at ${req.specPath}.` };
  const summary = `${req.ref} — ${req.type.toLowerCase()} from VortSpec spec`;
  const created = await createJiraIssue({
    project: req.project,
    type: req.type,
    summary,
    description: body.slice(0, 30_000),
  });
  if (created.ok && created.key) await linkIssue(req.projectPath, req.ref, created.key);
  return created;
}
