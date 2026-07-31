import { describe, expect, it } from "vitest";
import {
  libraryKind,
  buildProjectYaml,
  detectLibrary,
  themeApplyFor,
  themeContractFor,
  COMPONENT_LIBRARY_OPTIONS,
  type SetupAnswers,
} from "./setup";

describe("libraryKind — consume classification", () => {
  it("classifies cli-registry libraries", () => {
    expect(libraryKind("shadcn")).toBe("cli-registry");
  });

  it("classifies installed-package libraries", () => {
    for (const lib of ["mui", "antd", "chakra", "mantine", "astryx"]) {
      expect(libraryKind(lib)).toBe("installed-package");
    }
  });

  it("classifies headless libraries", () => {
    expect(libraryKind("radix")).toBe("headless");
    expect(libraryKind("headlessui")).toBe("headless");
  });

  it("returns unknown for `other` and unrecognized/empty", () => {
    expect(libraryKind("other")).toBe("unknown");
    expect(libraryKind("does-not-exist")).toBe("unknown");
    expect(libraryKind(undefined)).toBe("unknown");
    expect(libraryKind(null)).toBe("unknown");
  });
});

describe("buildProjectYaml — library consume kind + descriptor", () => {
  const base: SetupAnswers = {
    framework: "react",
    language: "typescript",
    styling: "tailwind",
    designSource: "library",
  } as SetupAnswers;

  it("derives the kind + writes the consume descriptor for a cli-registry library", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "shadcn" });
    expect(yaml).toContain("component_library: shadcn");
    expect(yaml).toContain("component_library_kind: cli-registry");
    expect(yaml).toContain('library_install_cmd: "npx shadcn@latest init --yes --defaults"');
    expect(yaml).toContain('library_add_cmd: "npx shadcn@latest add --yes"');
    expect(yaml).toContain('library_import_base: "@/components/ui"');
    expect(yaml).toContain('library_registry: "https://ui.shadcn.com/r"');
  });

  it("writes the installed-package kind + install/import for a package library", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "mui" });
    expect(yaml).toContain("component_library_kind: installed-package");
    expect(yaml).toContain('library_install_cmd: "npm install @mui/material @emotion/react @emotion/styled"');
    expect(yaml).toContain('library_import_base: "@mui/material"');
    expect(yaml).not.toContain("library_add_cmd:"); // installed-package has no add step
  });

  it("writes Astryx (Meta) as an installed-package with its install + init command", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "astryx" });
    expect(yaml).toContain("component_library: astryx");
    expect(yaml).toContain("component_library_kind: installed-package");
    expect(yaml).toContain(
      'library_install_cmd: "npm install @astryxdesign/core @astryxdesign/theme-neutral @astryxdesign/cli && npx @astryxdesign/cli init"',
    );
    expect(yaml).toContain('library_import_base: "@astryxdesign/core"');
  });

  it("normalizes a legacy answered kind for `other`", () => {
    const yaml = buildProjectYaml({
      ...base,
      componentLibrary: "other",
      componentLibraryKind: "package", // legacy value
    });
    expect(yaml).toContain("component_library: other");
    expect(yaml).toContain("component_library_kind: installed-package"); // normalized
  });

  it("omits the kind line when `other` has no answered kind", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "other" });
    expect(yaml).toContain("component_library: other");
    expect(yaml).not.toContain("component_library_kind:");
  });

  it("writes theme_apply per library kind (task 12.8)", () => {
    expect(buildProjectYaml({ ...base, componentLibrary: "shadcn" })).toContain("theme_apply: css-vars");
    expect(buildProjectYaml({ ...base, componentLibrary: "mui" })).toContain("theme_apply: theme-object:mui");
    // Astryx tokens are CSS custom properties (confirmed from docs) → css-vars path, not a bespoke object.
    expect(buildProjectYaml({ ...base, componentLibrary: "astryx" })).toContain("theme_apply: css-vars");
    expect(buildProjectYaml({ ...base, componentLibrary: "radix" })).toContain("theme_apply: css-vars");
  });

  it("surfaces the Astryx constraint as a project.yaml comment when Astryx is selected (task 7.2)", () => {
    const yaml = buildProjectYaml({ ...base, componentLibrary: "astryx" });
    expect(yaml).toContain("astryx component"); // the confirmed CLI enumeration command
    expect(yaml).toContain("cannot redefine the theme abstractly"); // the awareness caveat
    expect(yaml).toContain("no --json, no MCP"); // states the correction to the earlier assumption
  });
});

describe("LIBRARY_THEME_CONTRACTS — per-library consume+customize recipe (Phase 11)", () => {
  it("covers every supported library (all but `other`) with a complete contract", () => {
    for (const opt of COMPONENT_LIBRARY_OPTIONS) {
      if (opt.value === "other") continue;
      const c = themeContractFor(opt.value);
      expect(c, `missing contract for ${opt.value}`).toBeDefined();
      expect(c!.theming.length).toBeGreaterThan(0);
      expect(c!.componentLever.length).toBeGreaterThan(0);
      expect(c!.provider.length).toBeGreaterThan(0);
      expect(c!.enumerate.length).toBeGreaterThan(0);
    }
    expect(themeContractFor("other")).toBeUndefined();
  });

  it("distinguishes theme-object levers from CSS-var / headless theming", () => {
    expect(themeContractFor("mui")!.componentLever).toContain("theme.components.Mui");
    expect(themeContractFor("antd")!.componentLever).toContain("theme.components");
    expect(themeContractFor("shadcn")!.componentLever).toContain("CVA");
    expect(themeContractFor("radix")!.theming).toContain("No built-in token model");
  });

  it("Astryx contract reflects the CONFIRMED CLI enumeration (no MCP/--json) + CSS-var tokens (tasks 7.2/7.3)", () => {
    const c = themeContractFor("astryx")!;
    expect(c.enumerate).toContain("astryx component"); // CLI enumeration, not Storybook/.d.ts
    expect(c.enumerate).toContain("NO MCP"); // explicitly corrects the dropped MCP assumption
    expect(c.theming).toContain("CSS custom properties"); // tokens are CSS vars → css-vars path
    expect(c.theming).toContain("defineTheme"); // custom-theme authoring caveat present
  });
});

describe("themeApplyFor — apply strategy per source (task 12.8)", () => {
  it("maps consume + extract sources to their apply strategy", () => {
    expect(themeApplyFor({ designSource: "enterprise" })).toBe("overlay-injected");
    expect(themeApplyFor({ designSource: "library", componentLibrary: "mui" })).toBe("theme-object:mui");
    expect(themeApplyFor({ designSource: "library", componentLibrary: "chakra" })).toBe("theme-object:chakra");
    expect(themeApplyFor({ designSource: "library", componentLibrary: "astryx" })).toBe("css-vars"); // CSS-var tokens
    expect(themeApplyFor({ designSource: "library", componentLibrary: "shadcn" })).toBe("css-vars");
    expect(themeApplyFor({ designSource: "library", componentLibrary: "other" })).toBe("css-vars"); // fallback
    expect(themeApplyFor({ designSource: "figma" })).toBe("css-vars"); // extract source owns CSS tokens
  });
});

describe("detectLibrary — intake auto-detection", () => {
  it("detects shadcn from a root components.json (cli-registry)", () => {
    const d = detectLibrary({ react: "19" }, true);
    expect(d.library).toBe("shadcn");
    expect(d.kind).toBe("cli-registry");
  });

  it("detects installed-package libraries from dependencies", () => {
    expect(detectLibrary({ "@mui/material": "6" }, false)).toMatchObject({ library: "mui", kind: "installed-package" });
    expect(detectLibrary({ "@chakra-ui/react": "3" }, false)).toMatchObject({ library: "chakra", kind: "installed-package" });
    expect(detectLibrary({ "@astryxdesign/core": "1" }, false)).toMatchObject({ library: "astryx", kind: "installed-package" });
  });

  it("detects headless libraries", () => {
    expect(detectLibrary({ "@radix-ui/react-dialog": "1" }, false)).toMatchObject({ library: "radix", kind: "headless" });
    expect(detectLibrary({ "@headlessui/react": "2" }, false)).toMatchObject({ library: "headlessui", kind: "headless" });
  });

  it("flags a CSS-in-JS-only project as styling, not a component source", () => {
    const d = detectLibrary({ "@emotion/react": "11" }, false);
    expect(d.stylingOnly).toBe(true);
    expect(d.library).toBeUndefined();
  });

  it("returns no library when nothing is detected", () => {
    const d = detectLibrary({ react: "19", vite: "5" }, false);
    expect(d.library).toBeUndefined();
    expect(d.stylingOnly).toBeUndefined();
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
