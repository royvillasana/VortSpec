/**
 * The Props Glossary & Lookup Table — OpenSpec change: agentic-design-system, task 9b.1
 * (reference board, Frame 241).
 *
 * PURE — no fs. `main/inspector/props-glossary.ts` builds it from the project and writes the artifact.
 *
 * A cross-component index of prop name → type and accepted values, so `variant`, `size` and `tone`
 * mean the same thing everywhere. VortSpec already has every input — the roster's detected prop
 * controls and each metadata record's declared props — so this DERIVES an index rather than
 * extracting anything new.
 *
 * **The output that matters is the CONFLICTS, not the list.** A glossary of sixty prop names is a
 * reference nobody reads; "`size` is an enum of sm|md|lg on nine components and a number on one" is
 * a bug someone fixes this afternoon. It is also precisely what makes a generator invent a fourth
 * spelling of an existing prop: it sees disagreement and picks. So the artifact carries the whole
 * table and the digest carries only the disagreements.
 */

/** One component's declaration of one prop. */
export interface PropDeclaration {
  name: string;
  /** Declared type — a metadata record's TS type, or a detected control kind. */
  type: string;
  /** Accepted values, when the prop is an enum. */
  values: string[];
}

export interface GlossaryInput {
  component: string;
  props: PropDeclaration[];
}

export interface GlossaryEntry {
  prop: string;
  /** Components declaring it, sorted. */
  components: string[];
  /** The distinct normalised types it is declared with — more than one is a conflict. */
  types: string[];
  /** Union of accepted values across every component declaring it. */
  values: string[];
  /**
   * Values that only SOME components accept, where the type is otherwise agreed.
   *
   * Reported separately from a type conflict because it is a weaker signal and often legitimate — a
   * Badge reasonably has fewer sizes than a Button. Folding the two together would bury the type
   * conflicts, which are almost always real bugs, under a pile of defensible differences.
   */
  divergentValues: string[];
  conflict: boolean;
}

export interface PropsGlossary {
  entries: GlossaryEntry[];
  /** Entries with a type conflict, most-used first. The actionable half. */
  conflicts: GlossaryEntry[];
}

/**
 * Props whose name is universal and whose type legitimately differs.
 *
 * `className` is a string wherever it appears and `children` is whatever a component renders;
 * reporting either would put permanent noise at the top of the list, and a list whose first rows are
 * known non-problems is one people stop reading.
 */
const NOT_DESIGN_SYSTEM_PROPS = new Set([
  "classname",
  "class",
  "children",
  "style",
  "key",
  "ref",
  "id",
  "data-testid",
]);

/** Normalise a declared type so `"sm" | "md"` and a detected `enum` are comparable. */
export function normaliseType(type: string, values: readonly string[]): string {
  const t = type.trim().toLowerCase();
  // Values win: a prop with accepted values IS an enum, whatever the declaration called it.
  if (values.length > 0) return "enum";
  if (!t) return "unknown";
  if (t === "bool" || t === "boolean") return "boolean";
  if (t === "string" || t === "text") return "text";
  if (t === "number" || t === "int" || t === "float") return "number";
  // A TS union of string literals is an enum however it was written.
  if (t.includes("|") && /['"]/.test(t)) return "enum";
  return t;
}

export function buildPropsGlossary(inputs: readonly GlossaryInput[]): PropsGlossary {
  const uses = new Map<string, { component: string; type: string; values: string[] }[]>();

  for (const input of inputs)
    for (const prop of input.props) {
      const name = prop.name?.trim();
      if (!name || NOT_DESIGN_SYSTEM_PROPS.has(name.toLowerCase())) continue;
      const list = uses.get(name) ?? [];
      // One declaration per component per prop — a component detected twice must not look like
      // agreement (or disagreement) with itself.
      if (list.some((use) => use.component === input.component)) continue;
      list.push({
        component: input.component,
        type: normaliseType(prop.type ?? "", prop.values ?? []),
        values: [...new Set(prop.values ?? [])].sort(),
      });
      uses.set(name, list);
    }

  const entries: GlossaryEntry[] = [...uses.entries()]
    .map(([prop, list]) => {
      const types = [...new Set(list.map((use) => use.type))].sort();
      const allValues = [...new Set(list.flatMap((use) => use.values))].sort();
      // A value is divergent when at least one component that declares this prop does NOT accept it.
      // Only meaningful once more than one component declares it and they agree on the type.
      const enumUses = list.filter((use) => use.values.length > 0);
      const divergentValues =
        types.length === 1 && enumUses.length > 1
          ? allValues.filter((value) => enumUses.some((use) => !use.values.includes(value)))
          : [];
      return {
        prop,
        components: list.map((use) => use.component).sort(),
        types,
        values: allValues,
        divergentValues,
        conflict: types.length > 1,
      };
    })
    .sort((a, b) => b.components.length - a.components.length || a.prop.localeCompare(b.prop));

  return { entries, conflicts: entries.filter((entry) => entry.conflict) };
}

/**
 * The glossary as digest lines — CONFLICTS ONLY, and nothing at all when there are none.
 *
 * The full table lives in the artifact. Prepending sixty prop names to every grounded run would
 * spend the index's savings on a reference the run has no reason to read, while the disagreements
 * are few and change what gets generated.
 */
export function glossaryDigestLines(glossary: PropsGlossary): string[] {
  if (!glossary.conflicts.length) return [];
  return [
    "",
    `## Prop conflicts (${glossary.conflicts.length}) — the SAME prop name declared with different types`,
    "Reuse the existing name and type; do not introduce a variant spelling to sidestep the mismatch.",
    ...glossary.conflicts
      .slice(0, 12)
      .map(
        (entry) =>
          `- ${entry.prop}: ${entry.types.join(" vs ")} — across ${entry.components.slice(0, 6).join(", ")}${
            entry.components.length > 6 ? ` +${entry.components.length - 6}` : ""
          }`,
      ),
    ...(glossary.conflicts.length > 12
      ? [`- (+${glossary.conflicts.length - 12} more — read .vortspec/ai/props-glossary.toon)`]
      : []),
  ];
}
