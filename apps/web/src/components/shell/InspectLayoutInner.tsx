"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatStrip } from "@/components/shell/ChatStrip";
import { useAssistant } from "@/components/inspector/AssistantContext";
import { AssistantDrawer } from "@/components/inspector/AssistantDrawer";
import { BreadcrumbProvider, useBreadcrumb } from "@/components/shell/BreadcrumbContext";
import { Terminal } from "@/components/shell/Terminal";

function TopBar() {
  return (
    <header className="flex items-center justify-between px-6 h-12 border-b border-vs-border-default bg-vs-bg-primary flex-none">
      <Link href="/projects" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-vs-text-primary no-underline hover:opacity-80 transition-opacity">
        <img src="/favicon.png" alt="" width={20} height={20} className="flex-none" />
        VortSpec
      </Link>
      <button
        type="button"
        className="w-7 h-7 rounded-full bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center cursor-pointer"
      >
        <span className="text-[11px] text-vs-text-secondary leading-none">RV</span>
      </button>
    </header>
  );
}

function BreadcrumbBar() {
  const { items, extras } = useBreadcrumb();

  return (
    <div className="flex-none border-b border-vs-border-default bg-vs-bg-primary px-6 py-2.5 flex items-center justify-between min-h-[40px]">
      <nav className="flex items-center gap-1.5 text-[12px]">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-vs-text-muted hover:text-vs-text-primary no-underline transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-none">
            <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Projects
        </Link>
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-vs-text-muted">/</span>
            {item.href ? (
              <Link href={item.href} className="text-vs-text-muted hover:text-vs-text-primary no-underline transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-vs-text-primary font-medium">{item.label}</span>
            )}
          </span>
        ))}
      </nav>
      {extras && (
        <div className="flex items-center gap-2">
          {extras}
        </div>
      )}
    </div>
  );
}

export function InspectLayoutInner({
  children,
  navRail,
}: {
  children: React.ReactNode;
  navRail: React.ReactNode;
}) {
  const { isOpen } = useAssistant();
  // Terminal is hidden by default — only shown via keyboard shortcut (Ctrl+`)
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Debug shortcut: Ctrl+` toggles terminal
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setTerminalOpen((v) => !v);
      }
    }, { once: true });
  }

  return (
    <BreadcrumbProvider>
      <div className="flex flex-col w-full h-screen min-h-[720px] overflow-hidden">
        <TopBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {navRail}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <BreadcrumbBar />
            <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
            <Terminal visible={terminalOpen} onClose={() => setTerminalOpen(false)} />
          </div>
          {isOpen && <AssistantDrawer />}
          <ChatStrip />
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
