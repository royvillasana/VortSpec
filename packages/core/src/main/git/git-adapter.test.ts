import { describe, expect, it } from "vitest";
import { parseStatus, parseBranches, parseLog, parseGraph } from "./git-adapter";
import { parseGhAccounts, buildRepoCreateArgs, buildPrCreateArgs, parseGithubUrl } from "./github";

describe("parseStatus (porcelain v2)", () => {
  const SAMPLE = [
    "# branch.oid abc123",
    "# branch.head feature/x",
    "# branch.upstream origin/feature/x",
    "# branch.ab +2 -1",
    "1 M. N... 100644 100644 100644 aaa bbb src/staged.ts",
    "1 .M N... 100644 100644 100644 ccc ddd src/unstaged.ts",
    "1 MM N... 100644 100644 100644 eee fff src/both.ts",
    "2 R. N... 100644 100644 100644 ggg hhh R100 src/new-name.ts\tsrc/old-name.ts",
    "u UU N... 100644 100644 100644 000 iii jjj kkk src/conflict.ts",
    "? src/untracked.ts",
    "! src/ignored.ts",
  ].join("\n");

  it("parses branch, upstream, and ahead/behind", () => {
    const s = parseStatus(SAMPLE, true);
    expect(s.branch).toBe("feature/x");
    expect(s.upstream).toBe("origin/feature/x");
    expect(s.ahead).toBe(2);
    expect(s.behind).toBe(1);
  });

  it("splits staged vs unstaged, including a file that is both", () => {
    const s = parseStatus(SAMPLE, true);
    expect(s.staged.map((c) => c.path).sort()).toEqual(
      ["src/both.ts", "src/new-name.ts", "src/staged.ts"].sort(),
    );
    expect(s.unstaged.map((c) => c.path).sort()).toEqual(
      ["src/both.ts", "src/unstaged.ts"].sort(),
    );
    expect(s.staged.find((c) => c.path === "src/new-name.ts")?.status).toBe("renamed");
  });

  it("collects untracked and conflicts, and skips ignored", () => {
    const s = parseStatus(SAMPLE, true);
    expect(s.untracked).toEqual(["src/untracked.ts"]);
    expect(s.conflicts).toEqual(["src/conflict.ts"]);
    expect(JSON.stringify(s)).not.toContain("ignored");
    expect(s.clean).toBe(false);
  });

  it("reports a clean tree and a non-repo", () => {
    const clean = parseStatus("# branch.head main\n# branch.ab +0 -0", true);
    expect(clean.clean).toBe(true);
    const notRepo = parseStatus("", false);
    expect(notRepo.isRepo).toBe(false);
    expect(notRepo.clean).toBe(true);
  });

  it("handles a detached HEAD", () => {
    const s = parseStatus("# branch.head (detached)", true);
    expect(s.branch).toBeNull();
  });
});

describe("parseBranches", () => {
  it("marks the current branch and flags remotes", () => {
    const raw = ["main\torigin/main\t*", "feature/x\t\t", "origin/main\t\t"].join("\n");
    const b = parseBranches(raw, null);
    expect(b.find((x) => x.name === "main")?.current).toBe(true);
    expect(b.find((x) => x.name === "feature/x")?.current).toBe(false);
    expect(b.find((x) => x.name === "origin/main")?.remote).toBe(true);
    expect(b.find((x) => x.name === "main")?.remote).toBe(false);
  });
});

describe("parseLog", () => {
  it("parses record/field-delimited log entries", () => {
    const raw = "h1\x1fs1\x1fsubject one\x1fAlice\x1f2026-07-01\x1e";
    const log = parseLog(raw);
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({ hash: "h1", shortHash: "s1", subject: "subject one", author: "Alice", date: "2026-07-01" });
  });
});

describe("parseGraph", () => {
  it("parses parents (space-separated) and comma-separated refs", () => {
    const rec = "H1\x1fh1\x1fP1 P2\x1fAlice\x1f2 hours ago\x1fmerge branch\x1fHEAD -> main, origin/main, tag: v1";
    const commits = parseGraph(rec + "\x1e");
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toEqual(["P1", "P2"]);
    expect(commits[0].refs).toEqual(["HEAD -> main", "origin/main", "tag: v1"]);
    expect(commits[0].date).toBe("2 hours ago");
  });

  it("handles a root commit with no parents and no refs", () => {
    const commits = parseGraph("H1\x1fh1\x1f\x1fBob\x1f1 day ago\x1finit\x1f\x1e");
    expect(commits[0].parents).toEqual([]);
    expect(commits[0].refs).toEqual([]);
  });
});

describe("parseGhAccounts", () => {
  it("extracts one account (new + old gh formats)", () => {
    expect(parseGhAccounts("✓ Logged in to github.com account octocat (keyring)")).toEqual(["octocat"]);
    expect(parseGhAccounts("✓ Logged in to github.com as octocat")).toEqual(["octocat"]);
  });
  it("extracts multiple accounts", () => {
    const text = "✓ Logged in to github.com account octocat\n✓ Logged in to github.com account hubber";
    expect(parseGhAccounts(text).sort()).toEqual(["hubber", "octocat"]);
  });
  it("returns none when signed out", () => {
    expect(parseGhAccounts("You are not logged into any GitHub hosts.")).toEqual([]);
  });
});

describe("gh provider arg builders (M2)", () => {
  it("builds repo-create args that push the current folder, name as argv", () => {
    const args = buildRepoCreateArgs({ name: "my repo", visibility: "private", description: "d" });
    expect(args).toEqual([
      "repo", "create", "my repo", "--private", "--source=.", "--remote=origin", "--push", "--description", "d",
    ]);
    // No shell metacharacters are escaped/joined — the name is its own argv element.
    expect(args).toContain("my repo");
  });

  it("honors visibility and omits description when absent", () => {
    expect(buildRepoCreateArgs({ name: "r", visibility: "public" })).toEqual([
      "repo", "create", "r", "--public", "--source=.", "--remote=origin", "--push",
    ]);
  });

  it("builds pr-create args with title/body and optional base; never forces", () => {
    expect(buildPrCreateArgs({ title: "t", body: "b", base: "main" })).toEqual([
      "pr", "create", "--title", "t", "--body", "b", "--base", "main",
    ]);
    expect(buildPrCreateArgs({ title: "t" })).toEqual(["pr", "create", "--title", "t", "--body", ""]);
    expect(buildPrCreateArgs({ title: "t" }).join(" ")).not.toContain("--force");
  });

  it("extracts the created repo/PR url and trims trailing punctuation", () => {
    expect(parseGithubUrl("✓ Created repository me/app\nhttps://github.com/me/app")).toBe("https://github.com/me/app");
    expect(parseGithubUrl("see https://github.com/me/app/pull/3.")).toBe("https://github.com/me/app/pull/3");
    expect(parseGithubUrl("no url here")).toBeNull();
  });
});
