"use client";

import Link from "next/link";
import { useState } from "react";
import { CompletenessScore } from "@/components/ui/completeness-score";
import { StatusChip } from "@/components/ui/status-chip";
import type { ComponentSummary } from "@/lib/data/components";

function ComponentPreview({ type }: { type: string }) {
  switch (type) {
    case "button":
      return <span className="inline-flex items-center justify-center font-sans font-medium text-[11px] bg-[#2563EB] text-white rounded-md px-3 py-1.5">Continue</span>;
    case "input":
      return (
        <div className="w-[100px] h-[28px] bg-white border border-[#D4D4D8] rounded flex items-center px-2">
          <span className="text-[10px] text-[#9BA1AB]">Search…</span>
        </div>
      );
    case "card":
      return <div className="w-[80px] h-[48px] bg-white border border-[#D4D4D8] rounded-md" />;
    case "modal":
      return (
        <div className="w-[80px] h-[50px] bg-white border border-[#D4D4D8] rounded-md relative">
          <div className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full border border-[#D4D4D8]" />
        </div>
      );
    case "badge":
      return <span className="font-mono text-[9px] text-[#6B7280] border border-[#D4D4D8] bg-white rounded-full px-2 py-0.5">DRAFT</span>;
    default:
      return null;
  }
}

export function ComponentsPanel({ initialComponents }: { initialComponents?: ComponentSummary[] }) {
  const [search, setSearch] = useState("");

  const components = initialComponents ?? [];
  const filtered = components.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-vs-border-default">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[20px] font-semibold tracking-tight">Components</h1>
          <span className="font-mono text-[11px] text-vs-text-muted">{components.length} components</span>
        </div>
        <input
          type="text"
          placeholder="Search components…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[220px] bg-vs-bg-surface border border-vs-border-default rounded-md text-[12px] px-2.5 py-1.5 text-vs-text-primary placeholder:text-vs-text-muted outline-none focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)]"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((comp) => (
            <Link
              key={comp.id}
              href={`components/${comp.id}`}
              className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden text-inherit no-underline transition-colors hover:border-vs-border-strong group"
            >
              <div className="h-[120px] bg-vs-bg-elevated border-b border-vs-border-default flex items-center justify-center">
                <ComponentPreview type={comp.preview} />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold">{comp.name}</span>
                  <StatusChip status={comp.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-vs-text-muted">{comp.variants} variants</span>
                  <CompletenessScore score={comp.score} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
