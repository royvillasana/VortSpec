import { readThemeOverrides } from "./theme-override-store";
import { materializeCssOverlay } from "@vortspec/core/token-writers";

/**
 * The shared applier (change: consume-component-libraries, task 12.3) — the ONE place that turns the
 * durable overlay (`.vortspec/theme-overrides.json`) into the artifact a project needs to SEE its
 * personalization. It generalizes what `light-serve.ts:injectTokens` did ad-hoc so the light canvas,
 * the compile path, and the enterprise overlay all apply overrides the same way.
 *
 * For CSS-variable sources (shadcn / built / Astryx runtime CSS) and the enterprise/consumed overlay,
 * that artifact is an override stylesheet that wins by cascade (base tokens first, this appended after).
 * For an OWNED theme-object token file (MUI/Chakra/Mantine/Antd), the edit is patched into the file in
 * place by `setInspectorTokenValue`, so no token overlay entries exist and this returns "" naturally —
 * the emptiness of the overlay is what gates it, no `theme_apply` branch needed yet (that's task 12.8).
 */
export async function materializeThemeCss(projectPath: string): Promise<string> {
  const overrides = await readThemeOverrides(projectPath);
  return materializeCssOverlay(overrides);
}
