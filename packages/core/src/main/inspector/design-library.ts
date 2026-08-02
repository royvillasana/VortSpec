import {
  buildLibrarySections,
  computeTokenDrift,
  resolvePreview,
  type DesignSystemLibrary,
  type ScreenTokenDrift,
} from "@vortspec/core/design-library";
import { themeApplyFor } from "@vortspec/core/setup";
import { readProjectConfig } from "../workspace/config-manager";
import { getInspectorTokens } from "./token-parser";
import { readThemeOverrides } from "./theme-override-store";
import { readScreenTokens } from "./screen-tokens";

/**
 * Read a project's design system grouped by style property (change: design-system-style-panel, Phase 2) —
 * the I/O shell around the pure {@link buildLibrarySections}.
 *
 * `getInspectorTokens` already does the hard parts: it resolves the token file's `@import` chain (a
 * consumed library declares its tokens behind one, so reading the entry file alone found nothing), layers
 * the durable overlay so every value reported is the LIVE one, and types each token — which is the section
 * grouping. So this is a thin, honest projection of what the project actually has.
 */
export async function getDesignSystemLibrary(projectPath: string): Promise<DesignSystemLibrary> {
  const config = await readProjectConfig(projectPath);
  const tokens = await getInspectorTokens(projectPath).catch(() => null);
  const themeApply =
    config?.themeApply ??
    themeApplyFor({ designSource: config?.designSource, componentLibrary: config?.componentLibrary });
  return {
    designSource: config?.designSource ?? null,
    componentLibrary: config?.componentLibrary ?? null,
    themeApply,
    needsThemeAgent: themeApply.startsWith("theme-object"),
    sections: buildLibrarySections(tokens?.tokens ?? []),
    preview: resolvePreview(tokens?.tokens ?? []),
  };
}

/**
 * Where the user's SCREENS differ from the design system — shown on the affected token's own row, so the
 * offer to adopt lands where the user is already looking rather than as a banner they scroll past.
 */
export async function getScreenTokenDrift(projectPath: string): Promise<ScreenTokenDrift> {
  const [library, screens, overrides] = await Promise.all([
    getDesignSystemLibrary(projectPath),
    readScreenTokens(projectPath).catch(() => ({ screens: [], tokens: new Map() })),
    readThemeOverrides(projectPath),
  ]);
  const norm = (n: string): string => n.replace(/^--/, "").trim().toLowerCase();
  const set = new Set(Object.keys(overrides.tokens).map(norm));
  return computeTokenDrift(library.sections, screens.tokens, screens.screens, (t) => set.has(norm(t)));
}
