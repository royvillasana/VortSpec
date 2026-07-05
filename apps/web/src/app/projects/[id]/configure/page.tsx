"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { saveProjectConfig } from "@/lib/data/project-config";
import { generateAllComponents } from "@/lib/data/codegen";

/* ── types ──────────────────────────────────────────────────────── */

type Framework = "react" | "nextjs" | "vue" | "svelte";
type StyleLibrary = "tailwind" | "css-modules" | "styled-components";
type ComponentLibrary = "shadcn" | "radix" | "headless-ui" | "none";

interface OptionCardProps<T extends string> {
  value: T;
  selected: boolean;
  onSelect: (value: T) => void;
  icon: string;
  label: string;
  description: string;
}

/* ── option card ────────────────────────────────────────────────── */

function OptionCard<T extends string>({
  value,
  selected,
  onSelect,
  icon,
  label,
  description,
}: OptionCardProps<T>) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex items-start gap-3.5 w-full text-left px-4 py-3.5 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? "bg-vs-accent-muted border-vs-accent shadow-[inset_2px_0_0_#7C6FF0]"
          : "bg-vs-bg-surface border-vs-border-default hover:border-vs-border-strong"
      }`}
    >
      <span className="text-[20px] flex-none mt-0.5 leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <div
          className={`text-[13px] font-medium ${
            selected ? "text-vs-accent" : "text-vs-text-primary"
          }`}
        >
          {label}
        </div>
        <div className="text-[12px] text-vs-text-muted mt-0.5 leading-[1.5]">
          {description}
        </div>
      </div>
      <div className="flex-none mt-1">
        <div
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
            selected ? "border-vs-accent" : "border-vs-border-strong"
          }`}
        >
          {selected && (
            <div className="w-2 h-2 rounded-full bg-vs-accent" />
          )}
        </div>
      </div>
    </button>
  );
}

/* ── section header ─────────────────────────────────────────────── */

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-[14px] font-semibold text-vs-text-primary">
        {title}
      </h2>
      {description && (
        <p className="text-[12px] text-vs-text-muted mt-0.5">{description}</p>
      )}
    </div>
  );
}

/* ── spinner ────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <div
      className="w-[14px] h-[14px] rounded-full border-2 border-white border-t-transparent"
      style={{ animation: "vsSpin 0.8s linear infinite" }}
    />
  );
}

/* ── main page ──────────────────────────────────────────────────── */

const FRAMEWORKS: Array<{
  value: Framework;
  icon: string;
  label: string;
  description: string;
}> = [
  {
    value: "react",
    icon: "\u269B\uFE0F",
    label: "React",
    description: "Standard React with JSX components and hooks.",
  },
  {
    value: "nextjs",
    icon: "\u25B2",
    label: "Next.js",
    description: "React framework with server components, routing, and SSR.",
  },
  {
    value: "vue",
    icon: "\uD83C\uDF3F",
    label: "Vue",
    description: "Progressive framework with single-file components.",
  },
  {
    value: "svelte",
    icon: "\uD83D\uDD25",
    label: "Svelte",
    description: "Compile-time framework with minimal runtime overhead.",
  },
];

const STYLE_LIBRARIES: Array<{
  value: StyleLibrary;
  icon: string;
  label: string;
  description: string;
}> = [
  {
    value: "tailwind",
    icon: "\uD83C\uDF0A",
    label: "Tailwind CSS",
    description: "Utility-first CSS framework for rapid UI development.",
  },
  {
    value: "css-modules",
    icon: "\uD83D\uDDC2\uFE0F",
    label: "CSS Modules",
    description: "Scoped CSS with automatic class name hashing.",
  },
  {
    value: "styled-components",
    icon: "\uD83D\uDC85",
    label: "styled-components",
    description: "CSS-in-JS with tagged template literals.",
  },
];

const COMPONENT_LIBRARIES: Array<{
  value: ComponentLibrary;
  icon: string;
  label: string;
  description: string;
}> = [
  {
    value: "shadcn",
    icon: "\uD83C\uDFA8",
    label: "shadcn/ui",
    description: "Copy-paste components built on Radix with Tailwind.",
  },
  {
    value: "radix",
    icon: "\u2B21",
    label: "Radix UI",
    description: "Unstyled, accessible primitives for building UI.",
  },
  {
    value: "headless-ui",
    icon: "\uD83E\uDDE9",
    label: "Headless UI",
    description: "Unstyled, accessible components from Tailwind Labs.",
  },
  {
    value: "none",
    icon: "\u2014",
    label: "None",
    description: "Generate standalone components without a library.",
  },
];

export default function ConfigurePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [framework, setFramework] = useState<Framework>("react");
  const [styleLibrary, setStyleLibrary] = useState<StyleLibrary>("tailwind");
  const [componentLibrary, setComponentLibrary] =
    useState<ComponentLibrary>("none");

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      // Save the configuration
      await saveProjectConfig(projectId, framework, styleLibrary, componentLibrary);

      setProgress({ current: 0, total: 1 });

      // Generate all components
      const result = await generateAllComponents(projectId);

      setProgress({ current: result.generated, total: result.generated + result.failed });

      // Navigate to the components panel on completion
      router.push(`/projects/${projectId}/inspect/components`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Generation failed. Try again."
      );
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-vs-bg-primary">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-12 border-b border-vs-border-default">
        <Link
          href="/projects"
          className="text-[15px] font-semibold tracking-tight text-vs-text-primary no-underline hover:opacity-80 transition-opacity"
        >
          VortSpec
        </Link>
        <button
          type="button"
          className="w-7 h-7 rounded-full bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center cursor-pointer"
        >
          <span className="text-[11px] text-vs-text-secondary leading-none">
            RV
          </span>
        </button>
      </header>

      <main className="max-w-[640px] mx-auto py-10 px-6">
        {/* Heading */}
        <h1 className="text-[22px] font-semibold tracking-tight text-vs-text-primary mb-2">
          Configure your project
        </h1>
        <p className="text-[14px] text-vs-text-secondary mb-8 leading-[1.6]">
          Select your tech stack to generate production components
        </p>

        {/* Framework */}
        <section className="mb-8">
          <SectionHeader
            title="Framework"
            description="Choose the framework for your generated components."
          />
          <div className="flex flex-col gap-2.5">
            {FRAMEWORKS.map((opt) => (
              <OptionCard
                key={opt.value}
                value={opt.value}
                selected={framework === opt.value}
                onSelect={setFramework}
                icon={opt.icon}
                label={opt.label}
                description={opt.description}
              />
            ))}
          </div>
        </section>

        {/* Style Library */}
        <section className="mb-8">
          <SectionHeader
            title="Style Library"
            description="How should your components be styled?"
          />
          <div className="flex flex-col gap-2.5">
            {STYLE_LIBRARIES.map((opt) => (
              <OptionCard
                key={opt.value}
                value={opt.value}
                selected={styleLibrary === opt.value}
                onSelect={setStyleLibrary}
                icon={opt.icon}
                label={opt.label}
                description={opt.description}
              />
            ))}
          </div>
        </section>

        {/* Component Library */}
        <section className="mb-10">
          <SectionHeader
            title="Component Library"
            description="Optionally target a headless component library."
          />
          <div className="flex flex-col gap-2.5">
            {COMPONENT_LIBRARIES.map((opt) => (
              <OptionCard
                key={opt.value}
                value={opt.value}
                selected={componentLibrary === opt.value}
                onSelect={setComponentLibrary}
                icon={opt.icon}
                label={opt.label}
                description={opt.description}
              />
            ))}
          </div>
        </section>

        {/* Error message */}
        {error && (
          <p className="text-[12px] text-vs-error text-center mb-4">{error}</p>
        )}

        {/* Generate button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className={`w-full max-w-[400px] rounded-lg px-5 py-3 text-[14px] font-medium transition-opacity flex items-center justify-center gap-2.5 cursor-pointer ${
              generating
                ? "bg-vs-accent/70 text-white/80 cursor-not-allowed"
                : "bg-vs-accent text-white hover:opacity-90"
            }`}
          >
            {generating ? (
              <>
                <Spinner />
                <span>
                  {progress
                    ? `Generating components\u2026 ${progress.current}/${progress.total}`
                    : "Saving configuration\u2026"}
                </span>
              </>
            ) : (
              "Generate Components"
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
