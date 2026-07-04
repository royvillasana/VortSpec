"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PROJECT_ID = "meridian"; // TODO: derive from route params

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  active: boolean;
}

function NavItem({ href, label, icon, badge, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-[10px] py-[7px] px-2 rounded-md text-[13px] transition-colors ${
        active
          ? "bg-vs-bg-elevated text-vs-accent font-medium"
          : "text-vs-text-secondary hover:bg-vs-bg-elevated hover:text-vs-text-primary"
      }`}
    >
      <span className="flex-none w-[14px] h-[14px]">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {badge && (
        <span className="flex-none font-mono text-[11px] text-vs-warning bg-vs-warning-muted border border-vs-warning-border rounded-full px-1.5 py-px leading-tight">
          {badge}
        </span>
      )}
    </Link>
  );
}

const TokensIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle
      cx="7"
      cy="7"
      r="5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="7" cy="7" r="2" fill="currentColor" />
  </svg>
);

const ComponentsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect
      x="2"
      y="2"
      width="10"
      height="10"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const GraphIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle
      cx="3.5"
      cy="3.5"
      r="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle
      cx="10.5"
      cy="7"
      r="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle
      cx="4.5"
      cy="11"
      r="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path
      d="M5.3 4.4 L8.7 6.1 M8.6 8 L6 9.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);

const IssuesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect
      x="2.6"
      y="2.6"
      width="8.8"
      height="8.8"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      transform="rotate(45 7 7)"
    />
  </svg>
);

const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle
      cx="7"
      cy="7"
      r="5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M7 4.5 L7 7 L9 8.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle
      cx="7"
      cy="7"
      r="2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M7 1.5V3M7 11v1.5M1.5 7H3M11 7h1.5M3 3l1 1M10 10l1 1M3 11l1-1M10 4l1-1"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const navItems = [
  { key: "tokens", label: "Tokens", icon: <TokensIcon /> },
  { key: "components", label: "Components", icon: <ComponentsIcon /> },
  { key: "graph", label: "Graph", icon: <GraphIcon /> },
  { key: "issues", label: "Issues", icon: <IssuesIcon />, badge: "31" },
  { key: "history", label: "History", icon: <HistoryIcon /> },
];

export function NavRail() {
  const pathname = usePathname();
  const basePath = `/projects/${PROJECT_ID}/inspect`;

  return (
    <nav className="flex-none w-[220px] bg-vs-bg-surface border-r border-vs-border-default flex flex-col">
      {/* Project header */}
      <Link href="/projects" className="block px-3 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex-none w-5 h-5 rounded-md bg-vs-accent flex items-center justify-center">
            <span className="font-mono text-[11px] font-medium text-vs-bg-primary leading-none">
              M
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-vs-text-primary truncate">
              Meridian Design System
            </div>
            <div className="font-mono text-[11px] text-vs-text-muted">
              v14 &middot; 48 tokens
            </div>
          </div>
        </div>
      </Link>

      {/* Nav items */}
      <div className="flex-1 px-2 py-1 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const href = `${basePath}/${item.key}`;
          const active = pathname.startsWith(href);
          return (
            <NavItem
              key={item.key}
              href={href}
              label={item.label}
              icon={item.icon}
              badge={item.badge}
              active={active}
            />
          );
        })}
      </div>

      {/* Settings at bottom */}
      <div className="px-2 pb-3">
        <NavItem
          href={`${basePath}/settings`}
          label="Settings"
          icon={<SettingsIcon />}
          active={pathname.includes("/settings")}
        />
      </div>
    </nav>
  );
}
