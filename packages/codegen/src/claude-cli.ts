import { spawn } from "child_process";
import { z } from "zod";
import { generateTokenCSS } from "./token-css";
import type { CodeGenConfig, CodeGenResult } from "./generate";

const CodeGenResponseSchema = z.object({
  componentCode: z.string(),
  storyCode: z.string(),
  typesCode: z.string(),
  tokenCSS: z.string(),
});

/**
 * Generate component code using the Claude Code CLI.
 * Only works when running locally (Electron desktop app).
 * Falls back to null if claude CLI is not available.
 */
export async function generateViaClaude(
  componentIR: Record<string, unknown>,
  tokens: unknown[],
  config: CodeGenConfig,
): Promise<CodeGenResult | null> {
  const name = String(componentIR.name ?? "Component");
  const slug = String(componentIR.slug ?? "component");

  // Build a compact prompt for Claude CLI
  const variantAxes = (componentIR.variantAxes ?? []) as Array<Record<string, unknown>>;
  const props = (componentIR.props ?? []) as Array<Record<string, unknown>>;

  const variantDesc = variantAxes
    .map((a) => `${a.name}: ${(a.options as string[]).join(", ")}`)
    .join("; ");

  const propsDesc = props
    .map((p) => `${p.name}: ${p.type}${p.default != null ? ` = ${p.default}` : ""}`)
    .join("; ");

  const tokenList = (tokens as Array<Record<string, unknown>>)
    .slice(0, 15)
    .map((t) => t.name)
    .join(", ");

  const prompt = `Generate a production ${config.framework} + ${config.styleLibrary} component.

Component: "${name}" (slug: ${slug})
Variants: ${variantDesc || "none"}
Props: ${propsDesc || "none"}
Tokens available: ${tokenList || "none"}
Component library: ${config.componentLibrary}

Return ONLY a JSON object (no markdown fences, no explanation):
{
  "componentCode": "// full ${config.framework} component with TypeScript, using ${config.styleLibrary}${config.componentLibrary !== "none" ? ` and ${config.componentLibrary}` : ""}",
  "storyCode": "// Storybook CSF3 story showing all variant combinations",
  "typesCode": "// TypeScript props interface",
  "tokenCSS": "// CSS custom properties for tokens used"
}

Rules:
- TypeScript strict, no any
- Use CVA for variant management with Tailwind
- Reference design tokens as CSS variables
- Include all variant props
- Storybook story must show controls for each variant
- Code quality: clean, readable, production-ready`;

  return new Promise((resolve) => {
    try {
      const proc = spawn("claude", ["--print", prompt], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: process.env,
        timeout: 120000, // 2 minute timeout
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("error", () => {
        resolve(null); // Claude CLI not available
      });

      proc.on("exit", (code) => {
        if (code !== 0) {
          console.warn(`[claude-cli] exited with code ${code}: ${stderr}`);
          resolve(null);
          return;
        }

        // Extract JSON from output
        let jsonStr = stdout.trim();
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();

        try {
          const parsed = JSON.parse(jsonStr);
          const validated = CodeGenResponseSchema.parse(parsed);
          resolve({
            componentCode: validated.componentCode,
            storyCode: validated.storyCode,
            typesCode: validated.typesCode,
            tokenCSS: validated.tokenCSS || generateTokenCSS(tokens),
            model: "claude-code-cli",
          });
        } catch {
          // Try to extract code even if not perfect JSON
          if (stdout.includes("export") || stdout.includes("import")) {
            resolve({
              componentCode: stdout,
              storyCode: "",
              typesCode: "",
              tokenCSS: generateTokenCSS(tokens),
              model: "claude-code-cli-raw",
            });
          } else {
            resolve(null);
          }
        }
      });
    } catch {
      resolve(null); // spawn failed
    }
  });
}

/**
 * Check if the Claude CLI is available on this machine.
 */
export async function isClaudeCLIAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn("claude", ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        timeout: 5000,
      });
      proc.on("exit", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}
