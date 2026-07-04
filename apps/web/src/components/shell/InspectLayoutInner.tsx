"use client";

import { ChatStrip } from "@/components/shell/ChatStrip";
import { useAssistant } from "@/components/inspector/AssistantContext";
import { AssistantDrawer } from "@/components/inspector/AssistantDrawer";

export function InspectLayoutInner({
  children,
  navRail,
}: {
  children: React.ReactNode;
  navRail: React.ReactNode;
}) {
  const { isOpen } = useAssistant();

  return (
    <div className="flex w-full h-screen min-h-[720px] overflow-hidden">
      {navRail}
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
      {isOpen && <AssistantDrawer />}
      <ChatStrip />
    </div>
  );
}
