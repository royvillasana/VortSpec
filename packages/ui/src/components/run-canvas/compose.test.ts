import { describe, it, expect } from "vitest";
import { resembleComponent, matchTokenName } from "./compose";
import type { InspectorComponent } from "@vortspec/core/ipc";

describe("matchTokenName", () => {
  const tokens = [
    { name: "spacing-0", resolvedValue: "0px", type: "spacing" },
    { name: "spacing-4", resolvedValue: "16px", type: "spacing" },
    { name: "radius-md", resolvedValue: "16px", type: "radius" },
  ];
  it("matches a value to a token of the requested type", () => {
    expect(matchTokenName("16px", tokens, "spacing")).toBe("spacing-4");
    expect(matchTokenName("16px", tokens, "radius")).toBe("radius-md");
  });
  it("is null for a literal that matches no token (detach)", () => {
    expect(matchTokenName("15px", tokens, "spacing")).toBeNull();
  });
  it("normalizes whitespace/case before comparing", () => {
    expect(matchTokenName(" 0PX ", tokens, "spacing")).toBe("spacing-0");
  });
});

const button: InspectorComponent = {
  name: "Button",
  level: "atom",
  file: "src/components/Button.tsx",
  props: [
    {
      key: "variant",
      kind: "enum",
      options: ["primary", "secondary"],
      classes: { primary: "bg-primary text-white", secondary: "bg-teal-500 text-white" },
    },
  ],
  tokens: [],
  status: "built",
  issues: [],
  specPath: null,
  reportPath: null,
};

describe("resembleComponent", () => {
  it("flags a raw element styled exactly like a variant", () => {
    expect(resembleComponent("flex bg-primary text-white p-2 rounded", [button])).toMatchObject({
      name: "Button",
      file: "src/components/Button.tsx",
    });
  });

  it("does not flag on a single generic utility", () => {
    expect(resembleComponent("text-white", [button])).toBeNull();
  });

  it("returns null when no variant class set is fully present", () => {
    expect(resembleComponent("grid gap-4 bg-primary", [button])).toBeNull(); // only 1 of primary's 2 classes
  });
});
