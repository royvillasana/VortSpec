import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readProjectConfig } from "./config-manager";
import { normalizeLibraryKind } from "@vortspec/core/setup";

/**
 * Whether a `design_source: library` project has actually CONSUMED its component library — a REAL
 * readiness check, not the old `total > 0` component-count proxy (change: consume-component-libraries).
 * cli-registry → the CLI copied real source into `component_dir`; installed-package/headless → the
 * library's package resolves in `node_modules`. Non-library sources are not applicable (ready).
 */
export interface LibraryReadiness {
  /** True only for `design_source: library` projects — the readiness gate applies. */
  applicable: boolean;
  /** True when the library is actually consumable (or not applicable). */
  ready: boolean;
  kind?: string;
  /** Human-readable status / next action. */
  detail: string;
}

/** The root package specifier of an import base (`@mui/material/Button` → `@mui/material`). */
function packageRoot(spec: string): string {
  const parts = spec.split("/").filter(Boolean);
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? spec);
}

async function packageResolves(projectPath: string, pkg: string): Promise<boolean> {
  try {
    await access(join(projectPath, "node_modules", pkg, "package.json"));
    return true;
  } catch {
    return false;
  }
}

export async function getLibraryReadiness(projectPath: string): Promise<LibraryReadiness> {
  const cfg = await readProjectConfig(projectPath).catch(() => null);
  if (!cfg || cfg.designSource !== "library") {
    return { applicable: false, ready: true, detail: "Not a component-library source." };
  }
  const kind = normalizeLibraryKind(cfg.componentLibraryKind) ?? "installed-package";
  const lib = cfg.componentLibrary ?? "the library";

  if (kind === "cli-registry") {
    // The library's CLI copies real component SOURCE into component_dir → ready when files exist.
    const rel = cfg.componentDir ?? "src/components";
    const files = await readdir(join(projectPath, rel)).catch(() => [] as string[]);
    const ready = files.length > 0;
    return {
      applicable: true,
      ready,
      kind,
      detail: ready
        ? `${lib} source is present in ${rel}.`
        : `Run the ${lib} CLI to copy its components into ${rel}.`,
    };
  }

  // installed-package / headless → ready when the library's package resolves in node_modules.
  const pkg = cfg.libraryImportBase ? packageRoot(cfg.libraryImportBase) : undefined;
  const ready = pkg ? await packageResolves(projectPath, pkg) : false;
  return {
    applicable: true,
    ready,
    kind,
    detail: ready ? `${pkg} is installed.` : `Install ${pkg ?? lib} to consume it.`,
  };
}
