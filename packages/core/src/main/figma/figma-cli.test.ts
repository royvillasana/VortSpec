import { describe, expect, it } from "vitest";
import { parseFilesJson, parseMode } from "./figma-cli";

describe("parseFilesJson", () => {
  it("parses a JSON array of file names (string or object)", () => {
    expect(parseFilesJson('[{"name":"Design System"},{"name":"App"}]')).toEqual([
      "Design System",
      "App",
    ]);
    expect(parseFilesJson('["A","B"]')).toEqual(["A", "B"]);
  });

  it("tolerates a banner before the JSON", () => {
    expect(parseFilesJson('✨ figma-cli\nOpen files:\n[{"title":"Untitled"}]\n')).toEqual([
      "Untitled",
    ]);
  });

  it("returns [] on no JSON or malformed output", () => {
    expect(parseFilesJson("not connected")).toEqual([]);
    expect(parseFilesJson("[oops")).toEqual([]);
    expect(parseFilesJson("")).toEqual([]);
  });
});

describe("parseMode", () => {
  it("detects safe mode", () => {
    expect(parseMode("Daemon running in Safe Mode")).toBe("safe");
  });
  it("detects yolo/CDP mode", () => {
    expect(parseMode("Yolo Mode (direct CDP connection)")).toBe("yolo");
    expect(parseMode("connected via CDP")).toBe("yolo");
  });
  it("returns null when unknown", () => {
    expect(parseMode("Daemon running on port 3456")).toBeNull();
  });
});
