"use client";

import { useState } from "react";
import Link from "next/link";
import { CompletenessScore } from "@/components/ui/completeness-score";
import { StatusChip } from "@/components/ui/status-chip";
import { ProvenanceDot } from "@/components/ui/provenance-dot";
import { useToast } from "@/components/ui/toast";

const tokenBindings = [
  { id: "t1", name: "color/primary/500", value: "#2563EB", kind: "color" as const, property: "background", editable: true },
  { id: "t2", name: "color/surface/base", value: "#FFFFFF", kind: "color" as const, property: "text color", editable: true },
  { id: "t3", name: "radius/md", value: "8", kind: "radius" as const, property: "border-radius", editable: true },
  { id: "t4", name: "spacing/2", value: "8", kind: "spacing" as const, property: "padding-x", editable: false },
  { id: "t5", name: "spacing/1.5", value: "6", kind: "spacing" as const, property: "padding-y", editable: false },
];

const variantAxes = [
  { name: "intent", options: ["primary", "secondary", "ghost"], confidence: "inferred" as const },
  { name: "size", options: ["sm", "md", "lg"], confidence: "confirmed" as const },
];

const props = [
  { name: "label", type: "string", default: "Continue", provenance: "confirmed" as const },
  { name: "disabled", type: "boolean", default: "false", provenance: "confirmed" as const },
  { name: "icon", type: "string", default: "—", provenance: "inferred" as const },
  { name: "onClick", type: "function", default: "—", provenance: "confirmed" as const },
];

const states = [
  { name: "hover", provenance: "confirmed" as const },
  { name: "disabled", provenance: "confirmed" as const },
  { name: "focus", provenance: "inferred" as const },
];

const structureNodes = [
  { depth: 0, tag: "button", name: "root", flagged: false },
  { depth: 1, tag: "span", name: "icon-slot", flagged: false },
  { depth: 1, tag: "span", name: "label", flagged: false },
  { depth: 1, tag: "span", name: "ripple", flagged: true, literalValue: "#FFFFFF", promotedTo: null as string | null },
];

const issues: Array<{ id: string; text: string; severity: "error" | "warning" | "info"; action: string }> = [
  { id: "i1", text: "Raw value #FFFFFF on ripple element", severity: "warning", action: "Promote to token" },
  { id: "i2", text: "Focus state inferred, not confirmed", severity: "info", action: "Confirm" },
];

export function ComponentDetail() {
  const { showToast } = useToast();
  const [intent, setIntent] = useState("primary");
  const [size, setSize] = useState("md");
  const [label, setLabel] = useState("Continue");
  const [disabled, setDisabled] = useState(false);
  const [canvasBg, setCanvasBg] = useState<"dark" | "light">("dark");
  const [status, setStatus] = useState<"normalized" | "approved">("normalized");
  const [confirmedAxes, setConfirmedAxes] = useState<Set<string>>(new Set());
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({
    t1: "#2563EB", t2: "#FFFFFF", t3: "8",
  });
  const [promotedNodes, setPromotedNodes] = useState<Set<number>>(new Set());
  const [resolvedIssues, setResolvedIssues] = useState<Set<string>>(new Set());
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [componentName, setComponentName] = useState("Button");
  const [isRenaming, setIsRenaming] = useState(false);

  const bgColor = tokenValues.t1;
  const textColor = tokenValues.t2;
  const borderRadius = `${tokenValues.t3}px`;

  const buttonStyle = (() => {
    if (intent === "primary") return { background: bgColor, color: textColor, border: "none", borderRadius };
    if (intent === "secondary") return { background: "transparent", color: "#E7E9EC", border: "1px solid #34373D", borderRadius };
    return { background: "transparent", color: "#9BA1AB", border: "none", borderRadius };
  })();

  const sizeClass = size === "sm" ? "text-[11px] px-2.5 py-1" : size === "lg" ? "text-[14px] px-5 py-2.5" : "text-[12px] px-3.5 py-1.5";

  // Compute contrast ratio (simplified)
  const hexToLum = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };
  let contrastRatio = "—";
  try {
    const l1 = hexToLum(bgColor);
    const l2 = hexToLum(textColor);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    contrastRatio = ratio.toFixed(1) + ":1";
  } catch { /* skip */ }
  const contrastPass = parseFloat(contrastRatio) >= 4.5;

  const checks = [
    { name: "Renders", value: "9/9", passed: true },
    { name: "Text contrast", value: contrastRatio, passed: contrastPass },
    { name: "Hit target", value: "≥ 32px", passed: true },
    { name: "Focus state", value: states.some(s => s.name === "focus") ? "Present" : "Missing", passed: states.some(s => s.name === "focus") },
  ];

  const handleApprove = () => {
    const hasErrors = issues.some((i) => i.severity === "error" && !resolvedIssues.has(i.id));
    if (hasErrors) return;
    const hasWarnings = issues.some((i) => i.severity === "warning" && !resolvedIssues.has(i.id));
    if (hasWarnings) {
      setShowApproveDialog(true);
      return;
    }
    setStatus("approved");
    showToast(`${componentName} approved — status set to approved`);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-vs-border-default flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[13px]">
            <Link href="../components" className="text-vs-text-secondary hover:text-vs-text-primary no-underline">Components</Link>
            <span className="text-vs-text-muted">/</span>
            {isRenaming ? (
              <input
                autoFocus
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                onBlur={() => { setIsRenaming(false); showToast(`Renamed to ${componentName} — Patch applied`); }}
                onKeyDown={(e) => { if (e.key === "Enter") { setIsRenaming(false); showToast(`Renamed to ${componentName} — Patch applied`); } if (e.key === "Escape") setIsRenaming(false); }}
                className="font-semibold bg-vs-bg-elevated border border-vs-accent rounded px-1.5 py-0.5 text-[13px] text-vs-text-primary outline-none w-[120px]"
              />
            ) : (
              <span className="font-semibold cursor-pointer hover:text-vs-accent" onDoubleClick={() => setIsRenaming(true)}>{componentName}</span>
            )}
          </div>
          <StatusChip status={status} />
          <CompletenessScore score={82} />
        </div>
        <button
          onClick={handleApprove}
          className="bg-vs-accent text-white rounded-lg px-4 py-2 text-[13px] font-medium border-none cursor-pointer hover:brightness-110"
        >
          {status === "approved" ? "✓ Approved" : "Approve component"}
        </button>
      </div>

      {/* Content grid */}
      <div className="p-6 grid grid-cols-[2fr_1fr] gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Playground */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Playground</h2>
              <div className="flex gap-0.5 bg-vs-bg-primary border border-vs-border-default rounded-md p-0.5">
                {(["dark", "light"] as const).map((bg) => (
                  <button key={bg} onClick={() => setCanvasBg(bg)} className={`text-[11px] px-2 py-0.5 rounded border-none cursor-pointer font-sans ${canvasBg === bg ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary hover:text-vs-text-primary"}`}>
                    {bg}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas */}
            <div className={`h-[160px] flex items-center justify-center border-b border-vs-border-default ${canvasBg === "dark" ? "bg-vs-bg-elevated" : "bg-white"}`}>
              <span className={`inline-flex items-center justify-center font-sans font-medium ${sizeClass}`} style={buttonStyle}>
                {label}
              </span>
            </div>

            {/* Controls */}
            <div className="px-4 py-3 grid grid-cols-[110px_1fr] gap-y-2.5 gap-x-4 text-[12px] border-b border-vs-border-default">
              <span className="text-vs-text-muted">label</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} className="bg-vs-bg-elevated border border-vs-border-default rounded px-2 py-1 text-[12px] text-vs-text-primary outline-none focus:border-vs-accent w-full" />

              <span className="text-vs-text-muted">intent</span>
              <div className="flex gap-0.5 bg-vs-bg-primary border border-vs-border-default rounded-md p-0.5 w-fit">
                {["primary", "secondary", "ghost"].map((v) => (
                  <button key={v} onClick={() => setIntent(v)} className={`text-[11px] px-2 py-0.5 rounded border-none cursor-pointer font-mono ${intent === v ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-primary"}`}>{v}</button>
                ))}
              </div>

              <span className="text-vs-text-muted">size</span>
              <div className="flex gap-0.5 bg-vs-bg-primary border border-vs-border-default rounded-md p-0.5 w-fit">
                {["sm", "md", "lg"].map((v) => (
                  <button key={v} onClick={() => setSize(v)} className={`text-[11px] px-2 py-0.5 rounded border-none cursor-pointer font-mono ${size === v ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-primary"}`}>{v}</button>
                ))}
              </div>

              <span className="text-vs-text-muted">disabled</span>
              <button onClick={() => setDisabled(!disabled)} className={`w-[30px] h-[17px] rounded-full border-none cursor-pointer relative transition-colors ${disabled ? "bg-vs-accent" : "bg-vs-border-default"}`}>
                <span className={`absolute top-[2px] w-[13px] h-[13px] rounded-full bg-vs-text-primary transition-transform ${disabled ? "left-[15px]" : "left-[2px]"}`} />
              </button>
            </div>

            {/* Tokens table */}
            <div className="px-4 py-3 border-b border-vs-border-default">
              <div className="text-[11px] font-medium text-vs-text-muted uppercase tracking-wider mb-2">Consumed tokens</div>
              <div className="flex flex-col gap-1.5">
                {tokenBindings.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 text-[12px]">
                    <span className="font-mono text-vs-text-secondary w-[170px] truncate">{t.name}</span>
                    {t.kind === "color" && t.editable ? (
                      <input type="color" value={tokenValues[t.id] || t.value} onChange={(e) => setTokenValues((p) => ({ ...p, [t.id]: e.target.value }))} className="w-[24px] h-[22px] border border-vs-border-default rounded cursor-pointer bg-vs-bg-elevated p-0.5" />
                    ) : null}
                    {t.kind !== "color" && t.editable ? (
                      <input type="number" value={tokenValues[t.id] || t.value} onChange={(e) => setTokenValues((p) => ({ ...p, [t.id]: e.target.value }))} className="w-[48px] bg-vs-bg-elevated border border-vs-border-default rounded px-1.5 py-0.5 text-[11px] text-vs-text-primary font-mono outline-none" />
                    ) : null}
                    <span className="font-mono text-vs-text-muted text-[11px]">{tokenValues[t.id] || t.value}{t.kind !== "color" ? "px" : ""}</span>
                    {t.editable && tokenValues[t.id] && tokenValues[t.id] !== t.value && (
                      <button onClick={() => setTokenValues((p) => ({ ...p, [t.id]: t.value }))} className="text-[10px] text-vs-text-muted hover:text-vs-text-primary border-none bg-transparent cursor-pointer font-sans">Reset</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Checks */}
            <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
              {checks.map((c) => (
                <span key={c.name} className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 rounded-md border ${c.passed ? "text-vs-success border-[rgba(48,164,108,0.35)] bg-[rgba(48,164,108,0.08)]" : "text-vs-error border-[rgba(229,72,77,0.35)] bg-[rgba(229,72,77,0.08)]"}`}>
                  {c.passed ? "✓" : "✕"} {c.name} {c.value}
                </span>
              ))}
            </div>
          </section>

          {/* Variants matrix */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Variants</h2>
              {variantAxes.map((axis) => (
                <div key={axis.name} className="flex items-center gap-2">
                  <ProvenanceDot confidence={confirmedAxes.has(axis.name) ? "confirmed" : axis.confidence} />
                  <span className="font-mono text-[11px] text-vs-text-secondary">{axis.name}</span>
                  {axis.confidence === "inferred" && !confirmedAxes.has(axis.name) && (
                    <button onClick={() => { setConfirmedAxes((s) => new Set([...s, axis.name])); showToast(`Confirm axis ${axis.name} on Button — Patch applied`); }} className="text-[10px] text-vs-accent border-none bg-transparent cursor-pointer font-sans hover:underline">Confirm</button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-2">
                <div />
                {["sm", "md", "lg"].map((s) => (
                  <div key={s} className="text-center font-mono text-[10px] text-vs-text-muted py-1">{s}</div>
                ))}
                {["primary", "secondary", "ghost"].map((i) => (
                  <>
                    <div key={`label-${i}`} className="flex items-center font-mono text-[10px] text-vs-text-muted">{i}</div>
                    {["sm", "md", "lg"].map((s) => {
                      const style = i === "primary"
                        ? { background: bgColor, color: textColor, border: "none", borderRadius }
                        : i === "secondary"
                          ? { background: "transparent", color: "#E7E9EC", border: "1px solid #34373D", borderRadius }
                          : { background: "transparent", color: "#9BA1AB", border: "none", borderRadius };
                      const sc = s === "sm" ? "text-[9px] px-1.5 py-0.5" : s === "lg" ? "text-[12px] px-3 py-1.5" : "text-[10px] px-2 py-1";
                      return (
                        <div key={`${i}-${s}`} className="h-[64px] bg-vs-bg-elevated border border-vs-border-default rounded-md flex items-center justify-center group relative">
                          <span className={`inline-flex items-center justify-center font-sans font-medium ${sc}`} style={style}>Btn</span>
                          <span className="absolute bottom-1 font-mono text-[9px] text-vs-text-muted opacity-0 group-hover:opacity-100 transition-opacity">{i}/{s}</span>
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </section>

          {/* Structure */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Structure</h2>
            </div>
            <div className="px-4 py-3">
              {structureNodes.map((node, idx) => (
                <div key={idx} className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${10 + node.depth * 18}px` }}>
                  <span className="font-mono text-[12px] text-vs-text-muted">&lt;{node.tag}&gt;</span>
                  <span className="font-mono text-[12px] text-vs-text-secondary">{node.name}</span>
                  {node.flagged && !promotedNodes.has(idx) && (
                    <span className="inline-flex items-center gap-1.5 group">
                      <span className="font-mono text-[10px] text-vs-warning bg-[rgba(255,178,36,0.08)] border border-[rgba(255,178,36,0.35)] rounded-[5px] px-[7px] py-[2px]">{node.literalValue} flagged</span>
                      <button onClick={() => { setPromotedNodes((s) => new Set([...s, idx])); showToast("Promote " + node.literalValue + " to color/surface/base — Patch applied"); }} className="text-[10px] font-medium text-white bg-vs-accent rounded-[5px] px-2 py-[2px] border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Promote to token</button>
                    </span>
                  )}
                  {node.flagged && promotedNodes.has(idx) && (
                    <span className="font-mono text-[10px] text-vs-success bg-[rgba(48,164,108,0.08)] border border-[rgba(48,164,108,0.35)] rounded-[5px] px-[7px] py-[2px]">✓ color/surface/base</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Props */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Props</h2>
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-[1fr_1fr_1fr_20px] gap-y-2 gap-x-3 text-[12px]">
                <span className="text-vs-text-muted font-medium">Name</span>
                <span className="text-vs-text-muted font-medium">Type</span>
                <span className="text-vs-text-muted font-medium">Default</span>
                <span />
                {props.map((p) => (
                  <>
                    <span key={`n-${p.name}`} className="font-mono text-vs-text-primary">{p.name}</span>
                    <span key={`t-${p.name}`} className="font-mono text-vs-text-secondary">{p.type}</span>
                    <span key={`d-${p.name}`} className="font-mono text-vs-text-muted">{p.default}</span>
                    <ProvenanceDot key={`p-${p.name}`} confidence={p.provenance} />
                  </>
                ))}
              </div>
            </div>
          </section>

          {/* States */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">States</h2>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2">
              {states.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="w-[48px] h-[28px] bg-vs-bg-elevated border border-vs-border-default rounded flex items-center justify-center">
                    <span className="text-[8px] font-medium text-white bg-[#2563EB] rounded px-1.5 py-0.5">Btn</span>
                  </div>
                  <span className="font-mono text-[12px] text-vs-text-primary">{s.name}</span>
                  <ProvenanceDot confidence={s.provenance} />
                </div>
              ))}
            </div>
          </section>

          {/* Issues */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Issues</h2>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              {issues.map((issue) => (
                <div key={issue.id} className="flex items-center gap-3 text-[12px]">
                  <span className={`w-2 h-2 rounded-full flex-none ${resolvedIssues.has(issue.id) ? "bg-vs-success" : issue.severity === "error" ? "bg-vs-error" : issue.severity === "warning" ? "bg-vs-warning" : "bg-vs-text-muted"}`} />
                  <span className={`flex-1 ${resolvedIssues.has(issue.id) ? "text-vs-text-muted line-through" : "text-vs-text-secondary"}`}>{issue.text}</span>
                  {!resolvedIssues.has(issue.id) && (
                    <button onClick={() => { setResolvedIssues((s) => new Set([...s, issue.id])); showToast(`${issue.action} — Patch applied`); }} className="text-[11px] text-vs-accent border-none bg-transparent cursor-pointer font-sans hover:underline">{issue.action}</button>
                  )}
                  {resolvedIssues.has(issue.id) && (
                    <span className="text-[11px] text-vs-success">✓ Resolved</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Provenance */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Provenance</h2>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="text-vs-text-muted w-[70px]">Source</span>
                <span className="font-mono text-vs-text-secondary">stitch-export-checkout.zip</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-vs-text-muted w-[70px]">Extractor</span>
                <span className="font-mono text-vs-text-secondary">zip-html adapter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-vs-text-muted w-[70px]">Imported</span>
                <span className="font-mono text-vs-text-secondary">Jul 2, 2026 14:32</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Approve dialog */}
      {showApproveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={() => setShowApproveDialog(false)}>
          <div className="w-[440px] bg-vs-bg-surface border border-vs-border-strong rounded-lg shadow-2xl" style={{ animation: "vsDlgIn 0.15s ease" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-vs-border-default">
              <h3 className="text-[15px] font-semibold">Approve with warnings?</h3>
            </div>
            <div className="px-5 py-4 text-[12px] text-vs-text-secondary leading-relaxed">
              <p className="mb-3">{componentName} has open issues:</p>
              {issues.filter((i) => !resolvedIssues.has(i.id)).map((i) => (
                <div key={i.id} className="flex items-center gap-2 py-1">
                  <span className={`w-2 h-2 rounded-full ${i.severity === "warning" ? "bg-vs-warning" : "bg-vs-text-muted"}`} />
                  <span>{i.text}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-vs-border-default flex justify-end gap-3">
              <button onClick={() => setShowApproveDialog(false)} className="text-[13px] text-vs-text-secondary border border-vs-border-strong rounded-lg px-4 py-2 bg-transparent cursor-pointer hover:bg-vs-bg-elevated">Cancel</button>
              <button onClick={() => { setShowApproveDialog(false); setStatus("approved"); showToast("Button approved — status set to approved"); }} className="text-[13px] font-medium text-white bg-vs-accent rounded-lg px-4 py-2 border-none cursor-pointer hover:brightness-110">Approve anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
