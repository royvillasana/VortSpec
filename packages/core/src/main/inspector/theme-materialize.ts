import { readThemeOverrides } from "./theme-override-store";
import { materializeCssOverlay, materializeComponentCss } from "@vortspec/core/token-writers";
import { readProjectConfig } from "../workspace/config-manager";

/**
 * The shared applier (change: consume-component-libraries, tasks 12.3/12.7) — the ONE place that turns the
 * durable overlay (`.vortspec/theme-overrides.json`) into the CSS a project needs to SEE its personalization.
 * It generalizes what `light-serve.ts:injectTokens` did ad-hoc so the light canvas, the compile path, and
 * the enterprise overlay all apply overrides the same way: global token overrides as `:root`/per-mode vars,
 * plus per-component overrides as `data-component`-scoped rules.
 *
 * It honors the project's `theme_apply` strategy (task 12.8): CSS is the applier for `css-vars` (shadcn /
 * built / headless), `overlay-injected` (enterprise / consumed unowned source), and `astryx-defineTheme`
 * (Astryx applies personalization as runtime override CSS). For a `theme-object:<lib>` project (MUI / Chakra
 * / Mantine / Antd) the override is applied through the library's generated theme object / `theme.components`
 * lever — NOT CSS — so this returns "" there (the per-library recipe emits that artifact).
 */
export async function materializeThemeCss(projectPath: string): Promise<string> {
  const cfg = await readProjectConfig(projectPath);
  const apply = cfg?.themeApply ?? "css-vars";
  if (apply.startsWith("theme-object")) return "";
  const overrides = await readThemeOverrides(projectPath);
  return [materializeCssOverlay(overrides), materializeComponentCss(overrides)].filter(Boolean).join("\n");
}
