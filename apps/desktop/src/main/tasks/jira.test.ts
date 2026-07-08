import { describe, expect, it } from "vitest";
import {
  buildCreateIssueArgs,
  parseIssueRef,
  parseProjects,
  parseAccount,
  parseIssueStatus,
  installCommandFor,
} from "./jira";

describe("jira arg builders / parsers", () => {
  it("builds create-issue args with summary/project/type as argv (no interpolation)", () => {
    expect(buildCreateIssueArgs({ project: "DES", type: "Story", summary: "a nice; title", description: "b" })).toEqual([
      "issue", "create", "-t", "Story", "-p", "DES", "-s", "a nice; title", "--no-input", "-b", "b",
    ]);
    expect(buildCreateIssueArgs({ project: "DES", type: "Bug", summary: "x" })).toEqual([
      "issue", "create", "-t", "Bug", "-p", "DES", "-s", "x", "--no-input",
    ]);
  });

  it("parses the created issue key + url and trims punctuation", () => {
    expect(parseIssueRef("Issue created\nhttps://acme.atlassian.net/browse/DES-42.")).toEqual({
      key: "DES-42",
      url: "https://acme.atlassian.net/browse/DES-42",
    });
    expect(parseIssueRef("created DES-7").key).toBe("DES-7");
    expect(parseIssueRef("nothing here")).toEqual({ key: null, url: null });
  });

  it("parses a project list", () => {
    const text = "DES\tDesign System\nWEB   Web App\n";
    expect(parseProjects(text)).toEqual([
      { key: "DES", name: "Design System" },
      { key: "WEB", name: "Web App" },
    ]);
  });

  it("parses the account email and issue status", () => {
    expect(parseAccount("Account: dev@acme.com (Dev)")).toBe("dev@acme.com");
    expect(parseIssueStatus("Type: Story\nStatus: In Progress\nAssignee: -")).toBe("In Progress");
  });

  it("suggests a brew install command when brew is present", () => {
    expect(installCommandFor("darwin", true)).toContain("brew install");
    expect(installCommandFor("linux", false)).toBeNull();
  });
});
