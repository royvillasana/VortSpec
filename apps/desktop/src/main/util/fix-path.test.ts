import { describe, expect, it } from "vitest";
import { mergePath, fixGuiPath } from "./fix-path";

describe("mergePath", () => {
  it("keeps the first occurrence of each dir and drops duplicates", () => {
    expect(mergePath("/a:/b", "/b:/c")).toBe("/a:/b:/c");
  });

  it("preserves order — shell PATH wins over the GUI floor", () => {
    expect(mergePath("/opt/homebrew/bin", "/usr/bin:/opt/homebrew/bin")).toBe(
      "/opt/homebrew/bin:/usr/bin",
    );
  });

  it("ignores empty segments", () => {
    expect(mergePath("", "/a::/b:", "")).toBe("/a:/b");
  });
});

describe("fixGuiPath", () => {
  it("adds common tool dirs and never throws; leaves a non-empty PATH", async () => {
    const before = process.env.PATH;
    try {
      await fixGuiPath();
      // The fallback floor is always merged in, so these are present regardless
      // of what the probe shell returns.
      expect(process.env.PATH).toContain("/usr/local/bin");
      expect((process.env.PATH ?? "").length).toBeGreaterThan(0);
    } finally {
      process.env.PATH = before;
    }
  });
});
