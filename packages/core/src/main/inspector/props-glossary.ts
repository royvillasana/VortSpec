import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { buildPropsGlossary, type GlossaryInput, type PropsGlossary } from "@vortspec/core/props-glossary";
import { writeToon } from "@vortspec/core/toon";
import { AI_DIR } from "@vortspec/core/artifact-paths";
import { getInspectorComponents } from "./component-reader";
import { readAllMetadata } from "./component-metadata";
import { normComponentName } from "./figma-reconcile";

/**
 * Building and writing the props glossary — OpenSpec change: agentic-design-system, task 9b.1.
 *
 * Two sources, deliberately merged rather than one chosen:
 *
 *  • the roster's DETECTED prop controls, which know the accepted values because they were read out
 *    of CVA, but describe the type only as `enum`/`boolean`/`text`;
 *  • each metadata record's DECLARED props, which carry the real TS type and a description but no
 *    values.
 *
 * Either alone under-reports. A prop detected as `enum` on one component and declared as
 * `"sm" | "md"` on another is the SAME prop agreeing with itself, and `normaliseType` is what makes
 * the two comparable — without it the glossary would manufacture a conflict out of two spellings.
 */

export const GLOSSARY_PATH = `${AI_DIR}/props-glossary.toon`;

export async function collectGlossaryInput(projectPath: string): Promise<GlossaryInput[]> {
  const [roster, metadata] = await Promise.all([
    getInspectorComponents(projectPath).catch(() => null),
    readAllMetadata(projectPath).catch(() => new Map()),
  ]);

  const inputs: GlossaryInput[] = [];
  for (const component of roster?.components ?? []) {
    // Keyed by the NORMALISED name — `readMetadataFor` stores `normComponentName(name)`, so a
    // lookup by the raw roster name silently misses every component that is not already lowercase.
    const declared = metadata.get(normComponentName(component.name))?.props ?? [];
    const byName = new Map<string, { name: string; type: string; values: string[] }>();

    for (const control of component.props)
      byName.set(control.key, { name: control.key, type: control.kind, values: control.options });

    // The metadata record's TYPE is richer, so it wins; the detected VALUES are kept, because a
    // record rarely lists them and losing them would turn every enum into an unknown.
    for (const prop of declared) {
      const existing = byName.get(prop.name);
      byName.set(prop.name, {
        name: prop.name,
        type: prop.type || existing?.type || "",
        values: existing?.values ?? [],
      });
    }

    if (byName.size) inputs.push({ component: component.name, props: [...byName.values()] });
  }
  return inputs;
}

/** Build the glossary and write the artifact. */
export async function writePropsGlossary(
  projectPath: string,
  options: { generatedAt?: string } = {},
): Promise<{ glossary: PropsGlossary; written: string | null }> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const glossary = buildPropsGlossary(await collectGlossaryInput(projectPath));
  // A project with no props at all gets no artifact rather than an empty one: an empty table reads
  // as "checked, nothing shared", which is a different claim from "there was nothing to index".
  if (!glossary.entries.length) return { glossary, written: null };

  await mkdir(join(projectPath, AI_DIR), { recursive: true });
  await writeFile(
    join(projectPath, GLOSSARY_PATH),
    writeToon({
      generatedAt,
      stats: { props: glossary.entries.length, conflicts: glossary.conflicts.length },
      props: glossary.entries.map((entry) => ({
        prop: entry.prop,
        types: entry.types.join("|"),
        values: entry.values.join("|"),
        divergentValues: entry.divergentValues.join("|"),
        components: entry.components.join("|"),
        conflict: entry.conflict,
      })),
    }),
    "utf8",
  );
  return { glossary, written: GLOSSARY_PATH };
}
