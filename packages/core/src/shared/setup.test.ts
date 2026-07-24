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
