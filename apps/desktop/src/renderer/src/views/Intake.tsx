import { useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button } from "@vortspec/ui/ui";

type FieldKind = "text" | "area" | "chips";
interface Field {
  key: string;
  kind: FieldKind;
  label: string;
  placeholder?: string;
  options?: string[];
  optional?: boolean;
}
interface Step {
  label: string;
  title: string;
  blurb: string;
  fields: Field[];
}

const STEPS: Step[] = [
  {
    label: "Product",
    title: "What are you building?",
    blurb:
      "The same opening questions the CLI asks — in your words. Claude Code writes these to intake.json.",
    fields: [
      { key: "building", kind: "area", label: "What are you building?", placeholder: "One or two sentences on the feature or product." },
      { key: "audience", kind: "area", label: "Who is it for?", placeholder: "The primary user and their context." },
    ],
  },
  {
    label: "Scope",
    title: "Scope & goal",
    blurb: "Draw the boundary so the agent builds the right thing and stops there.",
    fields: [
      { key: "goal", kind: "text", label: "Primary user goal", placeholder: "What must the user be able to accomplish?" },
      { key: "inScope", kind: "area", label: "In scope for this run", placeholder: "Bullet the surfaces to generate.", optional: true },
    ],
  },
  {
    label: "Stack",
    title: "Tech stack",
    blurb: "What the generated code should target. VortSpec detects defaults from package.json where it can.",
    fields: [
      { key: "framework", kind: "chips", label: "Framework", options: ["React", "Vue", "Svelte", "SolidJS"] },
      { key: "styling", kind: "chips", label: "Styling", options: ["Tailwind", "CSS Modules", "styled-components", "vanilla CSS"] },
      { key: "pkg", kind: "chips", label: "Package manager", options: ["pnpm", "npm", "yarn", "bun"] },
    ],
  },
  {
    label: "Constraints",
    title: "Constraints",
    blurb: "Non-negotiables the spec and verification steps will enforce.",
    fields: [
      { key: "a11y", kind: "chips", label: "Accessibility target", options: ["WCAG 2.2 AA", "WCAG 2.1 AA", "No specific target"] },
      { key: "browsers", kind: "text", label: "Browser support", placeholder: "e.g. evergreen + iOS Safari 16" },
      { key: "perf", kind: "text", label: "Performance budget", placeholder: "e.g. LCP < 2.5s on 4G", optional: true },
    ],
  },
];

/**
 * Intake questionnaire (US-06, design: "Intake.dc.html") — the CLI's discovery
 * questions as a friendly 4-step wizard. Answers are written to
 * `.sdd-de/intake.json`. Optional: the v2 flow is source-driven, so this is
 * skippable and adds context rather than gating.
 */
export function Intake({
  project,
  onSkip,
  onDone,
}: {
  project: Project;
  onSkip: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: string, v: string): void => setVals((s) => ({ ...s, [key]: v }));
  const def = STEPS[step];
  const isLast = step === STEPS.length - 1;

  async function finish(): Promise<void> {
    setBusy(true);
    try {
      await api.saveIntake(project.path, serialize(vals));
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-vs-bg-primary text-vs-text-primary">
      <div className="mx-auto flex w-full max-w-[820px] gap-9 px-6 pb-16 pt-10">
        {/* step rail */}
        <div className="flex w-44 flex-none flex-col gap-0.5 pt-1.5">
          <div className="px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Intake
          </div>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s.label}
                onClick={() => setStep(i)}
                className={`flex items-center gap-2.5 rounded-md p-2 text-left text-[13px] ${
                  active ? "bg-vs-bg-elevated" : "hover:bg-vs-bg-elevated"
                }`}
              >
                <span
                  className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-[1.5px] font-mono text-[10px]"
                  style={{
                    borderColor: done ? "#30A46C" : active ? "#7C6FF0" : "#34373D",
                    background: done ? "#30A46C" : "transparent",
                    color: done ? "#0B0C0E" : active ? "#7C6FF0" : "#6B7280",
                  }}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={active ? "text-vs-text-primary" : "text-vs-text-secondary"}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* form */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{def.title}</h1>
              <span className="font-mono text-[11px] text-vs-text-muted">
                step {step + 1} / {STEPS.length}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-vs-text-secondary">{def.blurb}</p>
          </div>

          <div className="flex flex-col gap-5">
            {def.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-vs-text-primary">
                  {f.label}{" "}
                  {f.optional && <span className="font-normal text-vs-text-muted">(optional)</span>}
                </label>
                <FieldInput field={f} value={vals[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 border-t border-vs-border-default pt-5">
            {step > 0 && (
              <Button variant="default" onClick={() => setStep((s) => s - 1)}>
                ← Back
              </Button>
            )}
            <span className="flex-1" />
            <span className="text-[11px] text-vs-text-muted">
              {isLast ? "Written to .sdd-de/intake.json" : "Autosaved"}
            </span>
            <Button variant="ghost" onClick={onSkip}>
              Skip
            </Button>
            {isLast ? (
              <Button variant="primary" disabled={busy} onClick={() => void finish()}>
                {busy ? "Saving…" : "Save & run intake →"}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
                Next →
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  if (field.kind === "chips") {
    return (
      <div className="flex flex-wrap gap-2">
        {field.options?.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className="rounded-full border px-3.5 py-1.5 text-xs hover:border-vs-accent"
              style={{
                borderColor: active ? "#7C6FF0" : "#34373D",
                background: active ? "rgba(124,111,240,0.12)" : "transparent",
                color: active ? "#E7E9EC" : "#9BA1AB",
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.kind === "area") {
    return (
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="resize-none rounded-md border border-vs-border-default bg-vs-bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
      />
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="h-[38px] rounded-md border border-vs-border-default bg-vs-bg-surface px-3 text-[13px] text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
    />
  );
}

function serialize(vals: Record<string, string>): string {
  const line = (label: string, key: string): string => (vals[key] ? `**${label}**\n${vals[key]}\n` : "");
  return [
    "# Intake",
    "",
    "## Product",
    line("What are you building?", "building"),
    line("Who is it for?", "audience"),
    "## Scope",
    line("Primary user goal", "goal"),
    line("In scope", "inScope"),
    "## Stack",
    line("Framework", "framework"),
    line("Styling", "styling"),
    line("Package manager", "pkg"),
    "## Constraints",
    line("Accessibility", "a11y"),
    line("Browser support", "browsers"),
    line("Performance budget", "perf"),
  ]
    .filter((l) => l !== "")
    .join("\n");
}
