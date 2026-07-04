"use client";

import Link from "next/link";
import { useState } from "react";
import { CompletenessScore } from "@/components/ui/completeness-score";
import { StatusChip } from "@/components/ui/status-chip";
import type { ComponentSummary } from "@/lib/data/components";

function ComponentIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();

  // Pick icon based on component name
  if (lower.includes("nav")) return <span className="text-[20px]">🧭</span>;
  if (lower.includes("header")) return <span className="text-[20px]">📐</span>;
  if (lower.includes("footer")) return <span className="text-[20px]">🔻</span>;
  if (lower.includes("button")) return <span className="text-[20px]">🔘</span>;
  if (lower.includes("input") || lower.includes("textarea")) return <span className="text-[20px]">📝</span>;
  if (lower.includes("list")) return <span className="text-[20px]">📋</span>;
  if (lower.includes("icon")) return <span className="text-[20px]">✦</span>;
  if (lower.includes("grid")) return <span className="text-[20px]">⊞</span>;
  if (lower.includes("text")) return <span className="text-[20px]">T</span>;
  if (lower.includes("flex")) return <span className="text-[20px]">⬚</span>;
  if (lower.includes("form")) return <span className="text-[20px]">📄</span>;

  // Fallback: show component initial in a box
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-lg border-2 border-dashed border-vs-border-strong flex items-center justify-center">
      <span className="font-mono text-[14px] text-vs-text-muted font-medium">{initial}</span>
    </div>
  );
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
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[13px] text-vs-text-muted">
            {components.length === 0 ? "No components detected." : "No components match your search."}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map((comp) => (
              <Link
                key={comp.id}
                href={`components/${comp.id}`}
                className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden text-inherit no-underline transition-colors hover:border-vs-border-strong group"
              >
                <div className="h-[100px] bg-vs-bg-elevated border-b border-vs-border-default flex items-center justify-center">
                  <ComponentIcon name={comp.name} />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-semibold truncate mr-2">{comp.name}</span>
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
        )}
      </div>
    </div>
  );
}
