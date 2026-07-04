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
        <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
        {isOpen && <AssistantDrawer />}
        <ChatStrip />
      </div>
    </div>
  );
}
