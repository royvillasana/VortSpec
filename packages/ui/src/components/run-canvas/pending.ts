import type { Selection } from "@vortspec/core/ipc";
import { VIEWPORT_VARIANT, VIEWPORT_BREAKPOINT_LABEL } from "./viewports";

/** For a viewport-scoped edit (mobile/tablet), the instruction to realize it at only that
 *  breakpoint via a Tailwind max-width variant, preserving other widths. "" for desktop/base. */
function viewportScope(edit: PendingEdit): string {
  if (!edit.viewport || edit.viewport === "desktop") return "";
  const prefix = VIEWPORT_VARIANT[edit.viewport];
  const label = VIEWPORT_BREAKPOINT_LABEL[edit.viewport];
  return ` This edit was made in the ${edit.viewport} viewport — scope it to ${label}: realize it with Tailwind's \`${prefix}\` variant (e.g. \`${prefix}p-2\`, \`${prefix}bg-white\`) so ONLY that breakpoint changes and every other width keeps its current value. ADD the \`${prefix}\`-prefixed class; do NOT change the unprefixed base class.`;
}

/**
 * Pending-edit model for the Run-Canvas gated commit (change: run-canvas-visual-editor).
 *
 * Visual edits are collected here and stay ephemeral (live guest overrides only)
 * until the user hits Apply. Apply routes each edit by kind: a `token` edit is a
 * deterministic token-file rewrite (`inspector:setTokenValue`); a `style`/`variant`
 * edit is a component-source change delegated to a gated Claude Code run with a
 * revertable snapshot — VortSpec never rewrites component source itself (D3/D9).
 */
export type EditKind = "token" | "style" | "variant";

export interface PendingEdit {
  /** The section field key, or `variant:<prop>` — WHICH property was edited. */
  key: string;
  /** Unique ledger id: `<element>::<key>` — so the SAME property edited on two
   *  different elements are distinct entries (not a collision on `key` alone). */
  id: string;
  /** Durable fingerprint of the edited element — lets the un-saved override be replayed
   *  onto the same element after the preview reloads (persist + replay across navigation). */
  fingerprint?: string;
  /** Live node id of the edited element (for re-applying overrides after a per-edit removal). */
  nodeId?: string;
  /** The element's source file, when known — Apply groups edits by file and element. */
  file?: string | null;
  /** The element's label (component name or tag) — locates it in the Apply prompt + list. */
  elementLabel?: string;
  /** The element's leading text — disambiguates it among similar siblings in the prompt. */
  elementText?: string | null;
  /** The element's live className string — the exact anchor the Apply agent greps for to
   *  find the right JSX (and, for class-driven props like alignment/width, what to replace). */
  elementClassName?: string;
  /** Human label for the apply summary (e.g. `Radius`, `Variant · size`). */
  label: string;
  kind: EditKind;
  /** The new value the user set. */
  value: string;
  /** Owning token name for a `token` edit; null otherwise. */
  token: string | null;
  /** Whether this token is used by more than one place (a shared change). */
  shared: boolean;
  /** CSS properties a `style` edit maps to (for the run prompt). */
  cssProps: string[];
  /** The exact live override this edit applies — lets a single edit be removed
   *  and the rest re-applied on top of the restored original. Style edits only. */
  css?: Record<string, string>;
  /** Class swap a `variant` edit applies live (to re-preview after a removal). */
  removeClasses?: string[];
  addClasses?: string[];
  /** For a Figma-style width/height resize edit: the chosen Fixed/Hug/Fill mode. */
  resizeMode?: "fixed" | "hug" | "fill";
  /** A whole-element deletion — hidden live (display:none), removed from source on Apply. */
  remove?: boolean;
  /** The viewport this edit was made in (responsive editing) — mobile/tablet edits are
   *  scoped to that breakpoint in source; desktop is the base. Absent = base. */
  viewport?: "desktop" | "tablet" | "mobile";
}

/** Classify a Design-panel field edit into a `PendingEdit`, given the live selection + token usage. */
export function classifyFieldEdit(
  selection: Selection,
  key: string,
  value: string,
  cssProps: string[],
  tokenUses: (name: string) => number,
  /** Force a per-element style edit even if the value is token-backed — used by
   *  canvas drags (padding/gap/margin/resize), which Figma treats as detaching to
   *  a literal rather than editing the shared token. */
  forceStyle = false,
  /** The exact override map, when it isn't a simple `prop → value` (e.g. align, flow). */
  css?: Record<string, string>,
  /** Live token match for the NEW value (length fields): a name re-binds, `null`
   *  detaches to a literal. `undefined` falls back to the field's static token. */
  tokenOverride?: string | null,
): PendingEdit {
  const field = selection.sections.flatMap((s) => s.fields).find((f) => f.key === key);
  const token = forceStyle
    ? null
    : tokenOverride !== undefined
      ? tokenOverride
      : (field?.token ?? null);
  return {
    key,
    id: key, // RunApp overrides with `<element>::<key>` once it knows the target
    label: field?.label ?? key,
    kind: token ? "token" : "style",
    value,
    token,
    shared: token ? tokenUses(token) > 1 : false,
    cssProps,
    css: css ?? (cssProps.length ? Object.fromEntries(cssProps.map((p) => [p, value])) : undefined),
  };
}

export function classifyVariantEdit(
  prop: string,
  value: string,
  removeClasses: string[] = [],
  addClasses: string[] = [],
): PendingEdit {
  return {
    key: `variant:${prop}`,
    id: `variant:${prop}`, // RunApp overrides with `<element>::<key>`
    label: `Variant · ${prop}`,
    kind: "variant",
    value,
    token: null,
    shared: false,
    cssProps: [],
    removeClasses,
    addClasses,
  };
}

/**
 * The provenance of a canvas edit — how precisely it maps back to source (Phase 6).
 * `variant`/`token`/`text` are deterministic (a known option, token, or literal);
 * `freeform-style` is an arbitrary geometry/style target the agent must realize.
 */
export type EditProvenance = "variant" | "token" | "freeform-style" | "text";

/**
 * A `var(--name)` token *binding* — the element references the token in its source
 * (Phase 5), a gated source edit — as opposed to a concrete token-value edit that
 * rewrites the token's own definition in the token file. Applying a binding through
 * the token-value path would write `--name: var(--name)`, so the two must not mix.
 */
export function isTokenBinding(edit: PendingEdit): boolean {
  return edit.kind === "token" && /^\s*var\(\s*--/.test(edit.value);
}

/** Classify a recorded edit's provenance from its kind + field. */
export function editProvenance(edit: PendingEdit): EditProvenance {
  if (edit.kind === "variant") return "variant";
  if (edit.kind === "token") return "token";
  if (edit.key === "content") return "text";
  return "freeform-style";
}

/**
 * A single edit as a provenance-scoped instruction: exact for deterministic edits
 * (variant / token / text) so the agent doesn't have to guess intent, and clearly
 * flagged as an approximate visual target for freeform geometry/style.
 */
export function describeEdit(edit: PendingEdit): string {
  // A deletion — remove the whole element from source, not a style tweak.
  if (edit.remove) {
    const who = edit.elementLabel ? `the \`${edit.elementLabel}\`` : "this";
    const txt = edit.elementText ? ` (its text: "${edit.elementText.slice(0, 60)}")` : "";
    return `DELETE ${who} element${txt} from the source entirely — remove its whole JSX (opening tag, children, closing tag). If it is a component instance like \`<${edit.elementLabel ?? "Component"} …/>\`, remove THAT usage from this page's JSX — do NOT edit the component's own definition. Also drop anything used only by it (an import, handler, or data entry). Do not leave an empty wrapper, a commented-out block, or a \`display:none\`.`;
  }
  // Resize edits describe intent, not raw CSS — the run realizes Fixed/Hug/Fill in the
  // component's own idiom (utility classes, style props).
  if (edit.resizeMode) {
    const how =
      edit.resizeMode === "fixed"
        ? `a fixed ${edit.value}`
        : edit.resizeMode === "hug"
          ? "hug (size to) its content"
          : "fill the available space in its container";
    return `Set the element's ${edit.key} to ${how} (Figma-style resizing — realize it however best fits the component: a utility class like w-full/flex-1, or a style).${viewportScope(edit)}`;
  }
  switch (editProvenance(edit)) {
    case "variant": {
      const prop = edit.key.replace(/^variant:/, "");
      return `Set the \`${prop}\` variant to \`${edit.value}\` (exact — a known variant option).`;
    }
    case "token":
      return `Bind ${edit.label} to the design token \`--${edit.token}\` (exact — a known token).`;
    case "text":
      return `Set the element's visible text to \`${edit.value}\` (exact).`;
    case "freeform-style": {
      // Prefer the EXACT declarations the canvas computed (e.g. justify-content: center;
      // align-items: center) over the loose label — the agent must realize this precise
      // result, typically by swapping the element's utility classes (Tailwind
      // bg-*/text-*/justify-*/w-*), not by guessing an "approximate" value.
      const entries: [string, string][] =
        edit.css && Object.keys(edit.css).length
          ? Object.entries(edit.css)
          : edit.cssProps.map((p) => [p, edit.value]);
      const decls = entries.map(([k, v]) => `${k}: ${v || "(empty)"}`).join("; ");
      // A reset-to-none (the ✕ in the color/length pickers → transparent/none/empty) must
      // REMOVE the source value, not add a competing one: appending `bg-transparent` beside
      // `bg-white` usually loses in the cascade, so the file changes but nothing renders and
      // the change "reverts" on Keep. So instruct removal explicitly.
      const isReset = entries.length > 0 && entries.every(([, v]) => /^(transparent|none|)$/i.test(String(v).trim()));
      if (isReset) {
        const props = entries.map(([k]) => k).join(", ");
        return `RESET ${edit.label} to none (target computed style: \`${decls}\`). REMOVE the value in source — delete the utility class that sets ${props} (e.g. a \`bg-*\` background class, a \`text-*\` text-color class, a \`border-*\`/\`shadow-*\` class) or the matching CSS declaration. Do NOT add a \`*-transparent\`/\`*-none\` class alongside the existing one: it typically loses in the cascade and nothing changes — the existing class must be removed so the property no longer renders.${viewportScope(edit)}`;
      }
      return `Set this element's computed style to \`${decls}\`. If it's styled by utility classes, change the relevant class (e.g. \`bg-*\`/\`text-*\` for color, \`justify-*\`/\`items-*\` for alignment, \`w-*\`/\`flex-*\` for width) so the RENDERED result matches. If NO such class exists yet, ADD one (e.g. add a \`bg-*\` class when the element currently has no background). Don't just append an inline style or a second class that the existing one overrides.${viewportScope(edit)}`;
    }
  }
}

/** One element's worth of edits for the Apply prompt — its locator + the edits on it. */
export interface EditTarget {
  /** Source file the element lives in, when known. */
  file: string | null;
  /** Component name of the element, when recognized. */
  component: string | null;
  /** Human label (component name or tag) to locate the element. */
  label: string;
  /** The element's leading text — disambiguates it among similar siblings. */
  text: string | null;
  /** The element's live className — the concrete anchor to grep for in the source JSX. */
  className: string | null;
  /** When the element is a reused component instance, its component-definition file — a
   *  SECONDARY place the class may live (editing it changes every instance, so `file`,
   *  the usage site, is preferred for a per-instance change). */
  componentFile?: string | null;
  edits: PendingEdit[];
}

/**
 * Group a flat pending ledger by element (fingerprint), so edits spanning multiple
 * elements/files become one target each. Falls back to the field key when an edit
 * carries no target (legacy/synthetic edits).
 */
export function groupEditsByElement(edits: PendingEdit[]): EditTarget[] {
  const groups = new Map<string, EditTarget>();
  for (const e of edits) {
    const gkey = e.fingerprint || e.nodeId || e.elementLabel || "•";
    let g = groups.get(gkey);
    if (!g) {
      g = { file: e.file ?? null, component: null, label: e.elementLabel ?? "the element", text: e.elementText ?? null, className: e.elementClassName ?? null, edits: [] };
      groups.set(gkey, g);
    }
    g.edits.push(e);
  }
  return [...groups.values()];
}

/**
 * A concise prompt for the gated Claude Code run that commits the structural edits.
 * Edits are grouped per element so the run knows WHICH element each change targets —
 * essential once edits span more than one element (and possibly more than one file).
 */
export function buildEditPrompt(targets: EditTarget[]): string {
  const single = targets.length === 1;
  // The className is the strongest locator we have — grepping for it lands the agent on
  // the exact JSX element (a screen can reuse a component many times; the class string,
  // not the tag/label, is what distinguishes THIS instance's source line).
  const anchor = (t: EditTarget): string =>
    t.className ? ` Find it in source by its current classes: \`${t.className.slice(0, 200)}\`.` : "";
  const head = single
    ? `Apply this visual edit made in the VortSpec Run Canvas to ${
        targets[0].file ? `\`${targets[0].file}\`${targets[0].component ? ` (${targets[0].component})` : ""}` : "the page/component source that renders it"
      }.${anchor(targets[0])}`
    : `Apply these visual edits made in the VortSpec Run Canvas. They span ${targets.length} elements — apply each group to its own element, in its own source location.`;
  const blocks = targets.map((t) => {
    const where = single
      ? []
      : [
          ``,
          `On the "${t.label}" element${t.text ? ` whose leading text is "${t.text.slice(0, 120)}"` : ""}${
            t.file ? `, in \`${t.file}\`` : ""
          }${t.component ? ` (${t.component})` : ""}:${anchor(t)}`,
        ];
    return [...where, ...t.edits.map((e) => `- ${describeEdit(e)}`)];
  });
  // Per-instance guidance: the edited element is often a reused component instance whose
  // visual class lives on the USAGE (e.g. `<Card className="bg-neutral-100">` in the page),
  // NOT in the component's shared definition. So edit the usage; only touch the component
  // file if the class truly lives there AND the change is meant for every instance.
  const withComponent = targets.filter((t) => t.componentFile);
  const componentNote = withComponent.length
    ? [
        `IMPORTANT — per-instance change: each element above is a REUSED component instance. Its visual class (background, color, etc.) usually sits on the instance at its usage in \`${targets[0].file}\`, not in the component's shared definition. Change it at the usage so other instances are unaffected. Only if the class genuinely lives in the component's own file (${withComponent
          .map((t) => `\`${t.componentFile}\``)
          .join(", ")}) and the change is meant for EVERY instance should you edit there. If the element has no such class yet, add one on the instance (the component must forward \`className\`; if it doesn't, add the class in the component).`,
      ]
    : [];
  return [
    head,
    `Make the minimal change so the RENDERED result matches; preserve existing design-token usage and do not touch unrelated code. After editing, re-read the file to confirm the change is actually present.`,
    ...componentNote,
    // A bare layout element (a wrapper <div> with few/no classes) resolves by tag alone to
    // index.html's mount `<div id="root">` — forbid that: it's the HTML shell, not source.
    `Never edit index.html, or anything under dist/ or storybook-static/ — those are the HTML mount shell and build output. Edit the JSX page/component source under src/. A bare wrapper element lives in the page named above or a component it renders; if you truly cannot find it there, make NO change rather than editing the mount shell.`,
    ...blocks.flat(),
  ].join("\n");
}
