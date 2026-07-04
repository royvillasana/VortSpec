"use client";

import Link from "next/link";
import { ChatStrip } from "@/components/shell/ChatStrip";
import { useAssistant } from "@/components/inspector/AssistantContext";
import { AssistantDrawer } from "@/components/inspector/AssistantDrawer";

function TopBar() {
  return (
    <header className="flex items-center justify-between px-6 h-12 border-b border-vs-border-default bg-vs-bg-primary flex-none">
      <Link href="/projects" className="text-[15px] font-semibold tracking-tight text-vs-text-primary no-underline hover:opacity-80 transition-opacity">
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

function BackToProjects() {
  return (
    <div className="flex-none border-b border-vs-border-default bg-vs-bg-primary px-6 py-2.5">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-[12px] text-vs-text-muted hover:text-vs-text-primary no-underline transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-none">
          <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Projects
      </Link>
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

  return (
    <div className="flex flex-col w-full h-screen min-h-[720px] overflow-hidden">
      <TopBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {navRail}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <BackToProjects />
          <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
        </div>
        {isOpen && <AssistantDrawer />}
        <ChatStrip />
      </div>
    </div>
  );
}
