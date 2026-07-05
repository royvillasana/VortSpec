import { z } from "zod";
import { llmJSON } from "@vortspec/llm";
import { SYSTEM_PROMPT } from "./prompts/system";
import { buildReactTailwindPrompt } from "./prompts/react-tailwind";
import { generateTokenCSS } from "./token-css";
import { generateViaClaude } from "./claude-cli";

// ─── Public types ────────────────────────────────────────────

export interface CodeGenConfig {
  framework: string;    // 'react' | 'nextjs' | 'vue' | 'svelte'
  styleLibrary: string; // 'tailwind' | 'css-modules' | 'styled-components'
  componentLibrary: string; // 'shadcn' | 'radix' | 'headless-ui' | 'none'
}

export interface CodeGenResult {
  componentCode: string;
  storyCode: string;
  typesCode: string;
  tokenCSS: string;
  model: string;
}

// ─── Zod validation schema ───────────────────────────────────

const CodeGenResponseSchema = z.object({
  componentCode: z.string(),
  storyCode: z.string(),
  typesCode: z.string(),
  tokenCSS: z.string(),
});

type CodeGenResponse = z.infer<typeof CodeGenResponseSchema>;

// ─── Deterministic fallback ──────────────────────────────────

function buildFallback(
  componentIR: Record<string, unknown>,
  tokens: unknown[],
): CodeGenResult {
  const name = String(componentIR.name ?? "Component");
  const slug = String(componentIR.slug ?? "component");

  // Extract variant axes for props
  const variantAxes = (componentIR.variantAxes ?? []) as Array<Record<string, unknown>>;
  const variantProps = variantAxes.map((axis) => {
    const axisName = String(axis.name ?? "variant");
    const options = (axis.options ?? []) as string[];
    const defaultVal = String(axis.default ?? options[0] ?? "");
    return { name: axisName, options, default: defaultVal };
  });

  const variantTypeUnions = variantProps
    .map((v) => `  ${v.name}?: ${v.options.map((o) => `"${o}"`).join(" | ")};`)
    .join("\n");

  const variantDefaults = variantProps
    .map((v) => `  ${v.name} = "${v.default}",`)
    .join("\n");

  const propsInterface = `export interface ${name}Props {
${variantTypeUnions}
  className?: string;
  children?: React.ReactNode;
}`;

  const componentCode = `import React from "react";
import { cn } from "@/lib/utils";
import type { ${name}Props } from "./${slug}.types";

export function ${name}({
${variantDefaults}
  className,
  children,
}: ${name}Props) {
  return (
    <div className={cn("${slug}", className)}>
      {children}
    </div>
  );
}

${name}.displayName = "${name}";
`;

  const storyCode = `import type { Meta, StoryObj } from "@storybook/react";
import { ${name} } from "./${slug}";

const meta = {
  title: "Components/${name}",
  component: ${name},
} satisfies Meta<typeof ${name}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
`;

  const typesCode = `${propsInterface}
`;

  const tokenCSS = generateTokenCSS(tokens);

  return {
    componentCode,
    storyCode,
    typesCode,
    tokenCSS,
    model: "fallback",
  };
}

// ─── Main generation function ────────────────────────────────

export async function generateComponentCode(
  componentIR: unknown,
  tokens: unknown[],
  config: CodeGenConfig,
  options?: { projectId?: string },
): Promise<CodeGenResult> {
  const ir = componentIR as Record<string, unknown>;

  // Only react + tailwind is fully supported for now
  const isReactTailwind =
    (config.framework === "react" || config.framework === "nextjs") &&
    config.styleLibrary === "tailwind";

  if (!isReactTailwind) {
    return buildFallback(ir, tokens);
  }

  // Strategy 1: Try Claude Code CLI (local Electron mode)
  if (process.env.VORTSPEC_USE_CLAUDE_CLI === "true") {
    try {
      const cliResult = await generateViaClaude(ir, tokens, config);
      if (cliResult) {
        console.log(`[codegen] Generated ${ir.name} via Claude Code CLI`);
        return cliResult;
      }
    } catch {
      console.warn("[codegen] Claude CLI failed, trying OpenRouter...");
    }
  }

  // Strategy 2: Try OpenRouter LLM API
  const tokensAsRecords = tokens.map((t) => {
    if (typeof t === "object" && t !== null) return t as Record<string, unknown>;
    return {} as Record<string, unknown>;
  });
  const userPrompt = buildReactTailwindPrompt(ir, tokensAsRecords, config.componentLibrary);

  try {
    const result = await llmJSON<CodeGenResponse>(
      SYSTEM_PROMPT,
      userPrompt,
      (data) => CodeGenResponseSchema.parse(data),
      {
        temperature: 0,
        maxTokens: 8192,
        projectId: options?.projectId,
        purpose: "codegen",
      },
    );

    return {
      componentCode: result.data.componentCode,
      storyCode: result.data.storyCode,
      typesCode: result.data.typesCode,
      tokenCSS: result.data.tokenCSS,
      model: result.model,
    };
  } catch (err) {
    console.warn(
      `[codegen] LLM generation failed, using fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return buildFallback(ir, tokens);
  }
}
