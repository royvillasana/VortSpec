import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

/**
 * The DOM element that section headers portal into. A host (the IDE shell)
 * provides one so EVERY section's header renders in a single consistent region
 * ABOVE the main container instead of inside it — which keeps the main panel
 * free of a header band and lets the header float in the chrome. Null when no
 * host slot is provided (e.g. the desktop shell), where headers render inline.
 */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

/**
 * A section view's title bar. One uniform height (48px) and floating style
 * everywhere. When a host provides a {@link HeaderSlotContext} slot, it portals
 * ABOVE the main container; otherwise it renders inline. Replaces the per-view
 * `<header>` elements so every section header looks identical no matter the view.
 * Pass extra classes via `className` for content-specific tweaks (never height).
 */
export function ViewHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const slot = useContext(HeaderSlotContext);
  const header = (
    <header
      className={`m-2 flex h-12 flex-none items-center gap-3 rounded-xl vs-panel-surface px-5 ${className}`}
    >
      {children}
    </header>
  );
  return slot ? createPortal(header, slot) : header;
}
