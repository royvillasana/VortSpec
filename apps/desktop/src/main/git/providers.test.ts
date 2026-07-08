import { describe, expect, it } from "vitest";
import { providerIdFromUrl, providerFor } from "./providers";
import { buildGlabRepoCreateArgs, buildGlabMrArgs, parseGlabAccounts, parseGlabUrl } from "./gitlab";

describe("providerIdFromUrl", () => {
  it("maps hosts to providers (https + ssh)", () => {
    expect(providerIdFromUrl("https://github.com/me/app.git")).toBe("github");
    expect(providerIdFromUrl("git@github.com:me/app.git")).toBe("github");
    expect(providerIdFromUrl("https://gitlab.com/me/app.git")).toBe("gitlab");
    expect(providerIdFromUrl("git@gitlab.com:me/app.git")).toBe("gitlab");
    expect(providerIdFromUrl("https://bitbucket.org/me/app.git")).toBe("bitbucket");
    expect(providerIdFromUrl("https://example.com/me/app.git")).toBeNull();
  });
  it("registry returns a provider per id", () => {
    expect(providerFor("github").id).toBe("github");
    expect(providerFor("gitlab").id).toBe("gitlab");
    expect(providerFor("bitbucket").id).toBe("bitbucket");
  });
});

describe("gitlab (glab) arg builders", () => {
  it("builds repo-create args with visibility + optional description", () => {
    expect(buildGlabRepoCreateArgs({ name: "my proj", visibility: "private", description: "d" })).toEqual([
      "repo", "create", "my proj", "--visibility", "private", "--description", "d",
    ]);
    expect(buildGlabRepoCreateArgs({ name: "r", visibility: "public" })).toEqual([
      "repo", "create", "r", "--visibility", "public",
    ]);
  });
  it("builds mr-create args with title/body and optional target; never forces", () => {
    expect(buildGlabMrArgs({ title: "t", body: "b", base: "main" })).toEqual([
      "mr", "create", "--title", "t", "--description", "b", "--target-branch", "main",
    ]);
    expect(buildGlabMrArgs({ title: "t" }).join(" ")).not.toContain("--force");
  });
  it("parses accounts and the created url", () => {
    expect(parseGlabAccounts("✓ Logged in to gitlab.com as octo (…)")).toEqual(["octo"]);
    expect(parseGlabUrl("Created project.\nhttps://gitlab.com/me/app")).toBe("https://gitlab.com/me/app");
  });
});
