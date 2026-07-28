import { describe, expect, it } from "vitest";
import { libraryKind, buildProjectYaml, type SetupAnswers } from "./setup";

describe("libraryKind — provisioning classification", () => {
  it("classifies copy-source libraries", () => {
    expect(libraryKind("shadcn")).toBe("copy-source");
    expect(libraryKind("radix")).toBe("copy-source");
  });

  it("classifies package libraries", () => {
    for (const lib of ["mui", "antd", "chakra", "mantine", "headlessui"]) {
      expect(libraryKind(lib)).toBe("package");
    }
  });

  it("returns unknown for `other` and unrecognized/empty", () => {
    expect(libraryKind("other")).toBe("unknown");
    expect(libraryKind("does-not-exist")).toBe("unknown");
    expect(libraryKind(undefined)).toBe("unknown");
    expect(libraryKind(null)).toBe("unknown");
  });
});

describe("buildProjectYaml — library provisioning kind", () => {
  const base: SetupAnswers = {
    framework: "react",
    language: "typescript",
    styling: "tailwind",
    designSource: "library",
  } as SetupAnswers;

  it("derives and writes the kind for a known library", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "shadcn" });
    expect(yaml).toContain("component_library: shadcn");
    expect(yaml).toContain("component_library_kind: copy-source");
  });

  it("writes the package kind for a package library", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "mui" });
    expect(yaml).toContain("component_library_kind: package");
  });

  it("uses the answered kind for `other`", () => {
    const yaml = buildProjectYaml({
      ...base,
      componentLibrary: "other",
      componentLibraryKind: "package",
    });
    expect(yaml).toContain("component_library: other");
    expect(yaml).toContain("component_library_kind: package");
  });

  it("omits the kind line when `other` has no answered kind", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "other" });
    expect(yaml).toContain("component_library: other");
    expect(yaml).not.toContain("component_library_kind:");
  });
});

describe("buildProjectYaml — Connect Enterprise Design System", () => {
  const base: SetupAnswers = {
    framework: "react",
    language: "typescript",
    styling: "tailwind",
    designSource: "enterprise",
    tokenFile: "src/tokens.css",
    componentDir: "src/components",
  } as SetupAnswers;

  it("emits design_source: enterprise + the Storybook source (required)", () => {
    const yaml = buildProjectYaml({ ...base, enterpriseStorybookKind: "url", enterpriseStorybookRef: "https://sb.acme.com" });
    expect(yaml).toContain("design_source: enterprise");
    expect(yaml).toContain("storybook_source_kind: url");
    expect(yaml).toContain('storybook_source: "https://sb.acme.com"');
    // Never emits an extract/build source's keys.
    expect(yaml).not.toContain("component_library:");
    expect(yaml).not.toContain("figma_token_collection:");
  });

  it("includes the optional repo, knowledge base, and read-only Figma when provided", () => {
    const yaml = buildProjectYaml({
      ...base,
      enterpriseStorybookKind: "static",
      enterpriseStorybookRef: "storybook-static",
      enterpriseRepoUrl: "git@github.com:acme/ds.git",
      enterpriseKbKind: "docs-repo",
      enterpriseKbRef: "git@github.com:acme/handbook.git",
      figmaFileUrl: "https://figma.com/file/abc",
    });
    expect(yaml).toContain("storybook_source_kind: static");
    expect(yaml).toContain('enterprise_repo_url: "git@github.com:acme/ds.git"');
    expect(yaml).toContain("knowledge_base_kind: docs-repo");
    expect(yaml).toContain('knowledge_base: "git@github.com:acme/handbook.git"');
    expect(yaml).toContain('figma_file_url: "https://figma.com/file/abc"');
  });

  it("omits the optional blocks when not provided", () => {
    const yaml = buildProjectYaml({ ...base, enterpriseStorybookKind: "url", enterpriseStorybookRef: "http://localhost:6006" });
    expect(yaml).not.toContain("enterprise_repo_url:");
    expect(yaml).not.toContain("knowledge_base:");
    expect(yaml).not.toContain("figma_file_url:");
  });
});
