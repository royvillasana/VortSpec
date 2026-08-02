import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Project } from "ts-morph";

/**
 * Enumerate an installed-package/headless component's props + string-literal-union variants from its
 * bundled `.d.ts`, so the AI is grounded in the library's REAL API without a rebuilt Storybook
 * (change: consume-component-libraries). Uses ts-morph (already a dep) — no react-docgen. Best-effort:
 * any resolution/parse failure yields empty props, never a throw.
 */
export interface EnumeratedProp {
  name: string;
  type: string;
  optional: boolean;
  /** Present when the prop's type is a union of string literals (e.g. `variant`, `size`, `color`). */
  variants?: string[];
}
export interface EnumeratedComponent {
  component: string;
  props: EnumeratedProp[];
}

/** `"a" | "b" | "c"` → `["a","b","c"]`; anything that isn't a ≥2-member string-literal union → `[]`. */
export function stringLiteralUnion(typeText: string): string[] {
  const lits = typeText
    .split("|")
    .map((s) => s.trim())
    .filter((p) => /^["'][^"']*["']$/.test(p))
    .map((p) => p.slice(1, -1));
  return lits.length >= 2 ? lits : [];
}

/**
 * Pure: extract a component's props + variants from a `.d.ts` source string. Looks for the
 * conventional `<Component>Props` interface (MUI `ButtonProps`, Mantine `ButtonProps`, …).
 */
export function enumerateComponentFromDts(dtsSource: string, component: string): EnumeratedComponent {
  const props: EnumeratedProp[] = [];
  try {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { skipLibCheck: true } });
    const sf = project.createSourceFile("types.d.ts", dtsSource);
    const iface = sf.getInterface(`${component}Props`);
    if (iface) {
      for (const p of iface.getProperties()) {
        const type = p.getTypeNode()?.getText() ?? "";
        const variants = stringLiteralUnion(type);
        props.push({
          name: p.getName(),
          type,
          optional: p.hasQuestionToken(),
          ...(variants.length ? { variants } : {}),
        });
      }
    }
  } catch {
    // best-effort — never throw on a malformed declaration
  }
  return { component, props };
}

/** Read the most likely `.d.ts` for a component under a package, concatenating candidates found. */
async function readComponentDts(projectPath: string, pkg: string, component: string): Promise<string> {
  const candidates = [
    join("node_modules", pkg, component, `${component}.d.ts`),
    join("node_modules", pkg, `${component}.d.ts`),
    join("node_modules", pkg, "index.d.ts"),
    join("node_modules", pkg, "dist", "index.d.ts"),
  ];
  const found: string[] = [];
  for (const rel of candidates) {
    try {
      found.push(await readFile(join(projectPath, rel), "utf8"));
    } catch {
      // missing candidate — skip
    }
  }
  return found.join("\n");
}

/** The root package specifier of an import base (`@mui/material/Button` → `@mui/material`). */
function packageRoot(spec: string): string {
  const parts = spec.split("/").filter(Boolean);
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? spec);
}

/**
 * Resolve + enumerate an installed component from `node_modules`. `importBase` is the package
 * specifier from project.yaml (`library_import_base`); `component` is the export name.
 */
export async function enumeratePackageComponent(
  projectPath: string,
  importBase: string,
  component: string,
): Promise<EnumeratedComponent> {
  const dts = await readComponentDts(projectPath, packageRoot(importBase), component);
  if (!dts.trim()) return { component, props: [] };
  return enumerateComponentFromDts(dts, component);
}
