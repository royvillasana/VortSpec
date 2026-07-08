import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { IssueLinks } from "@vortspec/core/task";
import { issueLinksSchema } from "@vortspec/core/task";

/**
 * Per-project links between VortSpec artifacts (component/screen/spec `ref`) and
 * Jira issue keys — plain JSON at `.vortspec/jira-links.json`, local-first.
 */
function linksPath(cwd: string): string {
  return join(cwd, ".vortspec", "jira-links.json");
}

export async function readLinks(cwd: string): Promise<IssueLinks> {
  const raw = await readFile(linksPath(cwd), "utf8").catch(() => null);
  if (!raw) return {};
  try {
    const parsed = issueLinksSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function linkIssue(cwd: string, ref: string, key: string): Promise<void> {
  const links = await readLinks(cwd);
  links[ref] = key;
  try {
    await mkdir(join(cwd, ".vortspec"), { recursive: true });
    await writeFile(linksPath(cwd), JSON.stringify(links, null, 2), "utf8");
  } catch {
    /* best-effort */
  }
}
