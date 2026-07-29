import { describe, expect, it } from "vitest";
import { parseStorybookIndex, componentNameFromTitle, storyIframeUrl } from "./storybook-catalog";

describe("parseStorybookIndex", () => {
  it("parses a Storybook v7/v8 index.json (entries + type), skipping docs", () => {
    const raw = {
      v: 5,
      entries: {
        "atoms-button--primary": { id: "atoms-button--primary", name: "Primary", title: "Atoms/Button", type: "story", importPath: "./src/Button.stories.tsx" },
        "atoms-button--secondary": { id: "atoms-button--secondary", name: "Secondary", title: "Atoms/Button", type: "story" },
        "atoms-button--docs": { id: "atoms-button--docs", name: "Docs", title: "Atoms/Button", type: "docs" },
        "atoms-card--default": { id: "atoms-card--default", name: "Default", title: "Atoms/Card", type: "story" },
      },
    };
    const cat = parseStorybookIndex(raw);
    expect(cat.map((c) => c.component)).toEqual(["Button", "Card"]);
    const button = cat.find((c) => c.component === "Button")!;
    expect(button.stories.map((s) => s.name)).toEqual(["Primary", "Secondary"]); // docs skipped
    expect(button.stories[0].importPath).toBe("./src/Button.stories.tsx");
  });

  it("parses a Storybook v6 stories.json (stories, no type)", () => {
    const raw = {
      v: 3,
      stories: {
        "components-input--default": { id: "components-input--default", name: "Default", title: "Components/Input" },
        "components-input--error": { id: "components-input--error", name: "Error", title: "Components/Input" },
      },
    };
    const cat = parseStorybookIndex(raw);
    expect(cat).toHaveLength(1);
    expect(cat[0].component).toBe("Input");
    expect(cat[0].stories).toHaveLength(2);
  });

  it("returns [] for an unrecognized shape", () => {
    expect(parseStorybookIndex(null)).toEqual([]);
    expect(parseStorybookIndex({})).toEqual([]);
    expect(parseStorybookIndex({ nope: 1 })).toEqual([]);
  });
});

describe("componentNameFromTitle / storyIframeUrl", () => {
  it("takes the last title segment as the component name", () => {
    expect(componentNameFromTitle("Design System/Atoms/Button")).toBe("Button");
    expect(componentNameFromTitle("Button")).toBe("Button");
  });

  it("builds the standalone story iframe URL", () => {
    expect(storyIframeUrl("https://sb.acme.com/", "atoms-button--primary")).toBe(
      "https://sb.acme.com/iframe.html?id=atoms-button--primary&viewMode=story",
    );
  });
});
