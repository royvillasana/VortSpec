"use client";

import { NavRail } from "@/components/shell/NavRail";
import { ChatStrip } from "@/components/shell/ChatStrip";
import { AssistantProvider, useAssistant } from "@/components/inspector/AssistantContext";
import { AssistantDrawer } from "@/components/inspector/AssistantDrawer";

function InspectLayoutInner({ children }: { children: React.ReactNode }) {
  const { isOpen } = useAssistant();

  return (
    <div className="flex w-full h-screen min-h-[720px] overflow-hidden">
      <NavRail />
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
      {isOpen && <AssistantDrawer />}
      <ChatStrip />
    </div>
  );
}

export default function InspectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AssistantProvider>
      <InspectLayoutInner>{children}</InspectLayoutInner>
    </AssistantProvider>
  );
}
