"use client";

import { isElectron, runClaude } from "@/lib/electron";

export interface GeneratedCode {
  componentCode: string;
  storyCode: string;
  typesCode: string;
  tokenCSS: string;
  model: string;
}

/**
 * Generate component code — uses Claude Code CLI in Electron, OpenRouter API in cloud.
 */
export async function generateCode(
  componentName: string,
  componentIR: unknown,
  tokens: unknown[],
  config: { framework: string; styleLibrary: string; componentLibrary: string },
): Promise<GeneratedCode> {
  if (isElectron()) {
    return generateViaClaude(componentName, componentIR, tokens, config);
  }
  // Cloud fallback: call the server action which uses OpenRouter
  return generateViaServer(componentName);
}

async function generateViaClaude(
  componentName: string,
  componentIR: unknown,
  tokens: unknown[],
  config: { framework: string; styleLibrary: string; componentLibrary: string },
): Promise<GeneratedCode> {
  const prompt = buildClaudePrompt(componentName, componentIR, tokens, config);
  const result = await runClaude(prompt);

  if (!result.success) {
    throw new Error(result.error || "Claude CLI failed");
  }

  // Parse JSON from Claude's output
  try {
    const parsed = JSON.parse(result.output);
    return {
      componentCode: parsed.componentCode || parsed.code || "",
      storyCode: parsed.storyCode || parsed.story || "",
      typesCode: parsed.typesCode || parsed.types || "",
      tokenCSS: parsed.tokenCSS || parsed.css || "",
      model: "claude-code-cli",
    };
  } catch {
    // If not JSON, treat the whole output as component code
    return {
      componentCode: result.output,
      storyCode: "",
      typesCode: "",
      tokenCSS: "",
      model: "claude-code-cli",
    };
  }
}

async function generateViaServer(componentName: string): Promise<GeneratedCode> {
  // This calls the server action — the server uses OpenRouter
  throw new Error(
    `Cloud code generation for "${componentName}" — use the Generate button on the configure page`,
  );
}

function buildClaudePrompt(
  componentName: string,
  componentIR: unknown,
  tokens: unknown[],
  config: { framework: string; styleLibrary: string; componentLibrary: string },
): string {
  const ir = JSON.stringify(componentIR, null, 2);
  const tokenList = JSON.stringify(
    (tokens as Array<Record<string, unknown>>).slice(0, 20).map((t) => ({
      name: t.name,
      type: t.type,
      value: t.value,
    })),
    null,
    2,
  );

  return `Generate a production ${config.framework} component for "${componentName}" using ${config.styleLibrary}${config.componentLibrary !== "none" ? ` with ${config.componentLibrary}` : ""}.

Component IR:
${ir.slice(0, 3000)}

Design tokens:
${tokenList.slice(0, 1500)}

Return ONLY valid JSON with this shape:
{
  "componentCode": "// the React component code",
  "storyCode": "// the Storybook CSF3 story",
  "typesCode": "// TypeScript interface for props",
  "tokenCSS": "// CSS custom properties for tokens"
}

Rules:
- TypeScript strict, no any
- Use CVA (class-variance-authority) for variants when using Tailwind
- Reference tokens as CSS variables or Tailwind classes
- Include all variant props from the IR
- Storybook story must show all variant combinations
- Code should look like a senior engineer wrote it`;
}
