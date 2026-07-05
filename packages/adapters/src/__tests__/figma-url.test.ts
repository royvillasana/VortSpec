import { describe, it, expect } from "vitest";
import { parseFigmaUrl } from "../figma/url.js";

describe("parseFigmaUrl", () => {
  it("extracts fileKey from a /design/ URL", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/design/AbC123dEf456/My-Design-File?node-id=0-1",
    );
    expect(result).toEqual({ fileKey: "AbC123dEf456" });
  });

  it("extracts fileKey from a /file/ URL", () => {
    const result = parseFigmaUrl(
      "https://www.figma.com/file/XyZ789gHi012/Another-File",
    );
    expect(result).toEqual({ fileKey: "XyZ789gHi012" });
  });

  it("works without www prefix", () => {
    const result = parseFigmaUrl(
      "https://figma.com/design/Key12345Abcd/Title",
    );
    expect(result).toEqual({ fileKey: "Key12345Abcd" });
  });

  it("returns null for non-Figma URLs", () => {
    expect(parseFigmaUrl("https://google.com/design/abc")).toBeNull();
  });

  it("returns null for Figma URLs without file or design path", () => {
    expect(
      parseFigmaUrl("https://www.figma.com/community/plugin/123"),
    ).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFigmaUrl("")).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(parseFigmaUrl("not-a-url")).toBeNull();
  });
});
