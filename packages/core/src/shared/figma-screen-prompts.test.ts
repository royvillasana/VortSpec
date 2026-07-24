import { describe, expect, it } from "vitest";
import { buildSendScreenPrompt, buildPullScreenPrompt, parseSendResult } from "./figma-screen-prompts";

describe("figma screen prompts", () => {
  it("send prompt targets the existing DS file and instances mapped local components", () => {
    const p = buildSendScreenPrompt({
      file: "src/screens/Home.tsx",
      previewUrl: "http://localhost:5173/",
      fileKey: "DSFILEKEY",
      nodeId: null,
      screenLabel: "/home",
    });
    expect(p).toContain("figma-generate-design");
    expect(p).toContain("EXISTING Figma file DSFILEKEY");
    expect(p).toContain("Do NOT create a new file");
    // Local components instanced by figmaNodeId; importByKey only as fallback.
    expect(p).toContain("figma.getNodeByIdAsync(nodeId) → createInstance()");
    expect(p).toContain("ONLY as a fallback");
    // Must require the structured return line the cockpit parses.
    expect(p).toContain("RESULT:");
  });

  it("send prompt creates a fallback file only when no DS file is recorded", () => {
    const p = buildSendScreenPrompt({
      file: "src/App.tsx",
      previewUrl: null,
      fileKey: null,
      nodeId: null,
      screenLabel: "App",
    });
    expect(p).toContain("figma-create-new-file");
    expect(p).toContain("VortSpec — Screens");
  });

  it("send prompt updates in place on re-send", () => {
    const p = buildSendScreenPrompt({
      file: "src/App.tsx",
      previewUrl: null,
      fileKey: "K",
      nodeId: "12:34",
      screenLabel: "App",
    });
    expect(p).toContain("RE-SEND");
    expect(p).toContain("update the existing frame 12:34");
    expect(p).toContain("do NOT create a duplicate");
  });

  it("pull prompt reads the mapped node and edits the screen source", () => {
    const p = buildPullScreenPrompt({ file: "src/screens/Home.tsx", fileKey: "K", nodeId: "1:2", screenLabel: "/home" });
    expect(p).toContain("figma-design-to-code");
    expect(p).toContain("get_design_context on fileKey K, nodeId 1:2");
    expect(p).toContain("src/screens/Home.tsx");
  });

  it("parseSendResult extracts fileKey/nodeId/url from the trailing RESULT line", () => {
    const text =
      "Built the screen.\nRESULT: { \"fileKey\": \"ABC\", \"nodeId\": \"10:20\", \"url\": \"https://figma.com/design/ABC?node-id=10-20\" }";
    expect(parseSendResult(text)).toEqual({
      fileKey: "ABC",
      nodeId: "10:20",
      url: "https://figma.com/design/ABC?node-id=10-20",
    });
  });

  it("parseSendResult returns null when the RESULT line is absent or malformed", () => {
    expect(parseSendResult("no result here")).toBeNull();
    expect(parseSendResult('RESULT: { "nodeId": "10:20" }')).toBeNull(); // missing fileKey
    expect(parseSendResult("RESULT: not-json")).toBeNull();
  });
});
