import type { JSX } from "react";
import type { Activity } from "../lib/layout";

/** The IDE's single navigation. Explorer opens the primary sidebar; the rest
 *  open a full-center panel. Every icon carries a hover tooltip (title + label).
 *  `custom` renders a full (e.g. brand-colored) SVG instead of the monochrome one. */
type Item = { key: Activity; label: string; icon?: JSX.Element; custom?: JSX.Element };

/** The Git logo (simple-icons), in currentColor. */
const GitMark = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13.09 23.549a1.54 1.54 0 0 1-2.18 0L.451 13.089a1.54 1.54 0 0 1 0-2.179l7.191-7.19 2.733 2.733a1.85 1.85 0 0 0 .964 2.326v6.66a1.849 1.849 0 1 0 1.54 0V8.957l2.508 2.508a1.85 1.85 0 1 0 1.09-1.09l-2.634-2.634a1.85 1.85 0 0 0-2.378-2.377L8.73 2.63 10.91.451a1.54 1.54 0 0 1 2.179 0l10.459 10.46a1.54 1.54 0 0 1 0 2.179z" />
  </svg>
);

/** The Jira logo (simple-icons), in currentColor. */
const JiraMark = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z" />
  </svg>
);

/** The official Storybook monochrome mark (github.com/storybookjs/brand) — the
 *  book with the "S" and bookmark as negative space, in currentColor. */
const StorybookMark = (
  <svg width="15" height="18" viewBox="0 0 52 64" aria-hidden="true">
    <g transform="translate(1,1)">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M50.2729096,2.92285771 C50.2769973,2.98759391 50.2790429,3.05244063 50.2790429,3.11730315 L50.2790429,58.8828028 C50.2790429,60.6043831 48.8689636,62 47.1295431,62 C47.0824212,62 47.0353056,61.9989534 46.9882313,61.9968606 L4.94876437,60.1280997 C3.31149338,60.0553189 2.00425692,58.751918 1.94279175,57.1309472 L0.0022554267,5.95476663 C-0.0618328758,4.26461814 1.24754196,2.83223697 2.95307926,2.72673418 L37.427,0.594 L37.1272753,7.62078766 C37.1238721,7.70179664 37.1419373,7.78178731 37.179031,7.85305525 L37.2223772,7.92113026 C37.3791917,8.12573637 37.6738999,8.16578288 37.880626,8.0105767 L40.6382617,5.94019678 L42.9673936,7.75618537 C43.0546693,7.82423279 43.1634862,7.85946584 43.2745216,7.85562813 C43.5338374,7.84666553 43.7367132,7.6313391 43.7276576,7.37468316 L43.467,0.22 L46.9330824,0.00617628491 C48.6691159,-0.10121296 50.1644074,1.2046298 50.2729096,2.92285771 Z M29.4029796,23.368648 C29.4029796,24.58142 37.6567008,24.00017 38.7646901,23.1482813 C38.7646901,14.8895929 34.2873503,10.5497821 26.0885852,10.5497821 C17.88982,10.5497821 13.2961856,14.9571143 13.2961856,21.5681161 C13.2961856,33.0822778 28.9959487,33.3026444 28.9959487,39.5830962 C28.9959487,41.3460299 28.1237396,42.3927719 26.2048797,42.3927719 C23.7045471,42.3927719 22.7160434,41.1289316 22.832338,36.8317805 C22.832338,35.8995698 13.2961856,35.6089448 13.0054493,36.8317805 C12.2651161,47.2453073 18.8201763,50.248968 26.3211742,50.248968 C33.5895831,50.248968 39.2880157,46.4144645 39.2880157,39.4729126 C39.2880157,27.132376 23.3556634,27.4629261 23.3556634,21.3477494 C23.3556634,18.8686237 25.2163761,18.5380737 26.3211742,18.5380737 C27.4841196,18.5380737 29.5774214,18.7409467 29.4029796,23.368648 Z M37.1272753,7.62078766 L37.4276823,0.591583333 L43.4674595,0.218291667 L43.7276576,7.37468316 C43.7367132,7.6313391 43.5338374,7.84666553 43.2745216,7.85562813 C43.1634862,7.85946584 43.0546693,7.82423279 42.9673936,7.75618537 L40.6382617,5.94019678 L37.880626,8.0105767 C37.6738999,8.16578288 37.3791917,8.12573637 37.2223772,7.92113026 C37.1563661,7.83500129 37.1227378,7.72879963 37.1272753,7.62078766 Z"
      />
    </g>
  </svg>
);

const TOP: Item[] = [
  {
    key: "explorer",
    label: "Explorer",
    icon: <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4l2 2.5h5A1.5 1.5 0 0 1 17 7v8.5A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-11Z" />,
  },
  {
    key: "source",
    label: "Source Control",
    custom: GitMark,
  },
  {
    key: "flow",
    label: "SDD-DE pipeline",
    icon: <path d="M5 4h10M5 4a1.5 1.5 0 1 1 0 .01M5 10h10M15 10a1.5 1.5 0 1 1 0 .01M5 16h10M5 16a1.5 1.5 0 1 1 0 .01M5 5.5v3M15 11.5v3" />,
  },
  {
    key: "run",
    label: "Run app",
    icon: <path d="M6 4.5v11l9-5.5-9-5.5Z" />,
  },
  {
    key: "play",
    label: "Storybook",
    custom: StorybookMark,
  },
  {
    key: "tokens",
    label: "Design tokens",
    icon: <path d="M10 2 3 6v8l7 4 7-4V6l-7-4Zm0 2.3L14.7 7 10 9.7 5.3 7 10 4.3Z" />,
  },
  {
    key: "tasks",
    label: "Tasks",
    custom: JiraMark,
  },
  {
    key: "manifest",
    label: "Design manifest",
    icon: <path d="M6 3h5l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm5 0v3h3" />,
  },
];

const SETTINGS: Item = {
  key: "settings",
  label: "Settings (profile)",
  icon: <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6.5-2.5c0 .5 0 1-.1 1.4l1.4 1.1-1.5 2.6-1.7-.7c-.7.5-1.5.9-2.3 1.1l-.3 1.8H8.5l-.3-1.8c-.8-.2-1.6-.6-2.3-1.1l-1.7.7-1.5-2.6 1.4-1.1c-.1-.4-.1-.9-.1-1.4s0-1 .1-1.4L2.7 7.6l1.5-2.6 1.7.7c.7-.5 1.5-.9 2.3-1.1L8.5 2.8h3l.3 1.8c.8.2 1.6.6 2.3 1.1l1.7-.7 1.5 2.6-1.4 1.1c.1.4.1.9.1 1.4Z" />,
};

function IconButton({
  item,
  active,
  onClick,
}: {
  item: Item;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
        active ? "text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-secondary"
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 h-7 w-0.5 rounded-r bg-vs-accent" />}
      {item.custom ?? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          {item.icon}
        </svg>
      )}
    </button>
  );
}

export function ActivityBar({
  active,
  onSelect,
  chatOpen,
  onToggleChat,
}: {
  active: Activity;
  onSelect: (key: Activity) => void;
  chatOpen: boolean;
  onToggleChat: () => void;
}): JSX.Element {
  return (
    <nav
      aria-label="Activity bar"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-vs-border-default bg-vs-bg-surface py-2"
    >
      {TOP.map((item) => (
        <IconButton key={item.key} item={item} active={active === item.key} onClick={() => onSelect(item.key)} />
      ))}
      <div className="mt-auto" />
      <IconButton item={SETTINGS} active={active === "settings"} onClick={() => onSelect("settings")} />
      <button
        type="button"
        title="Toggle assistant"
        aria-label="Toggle assistant"
        aria-pressed={chatOpen}
        onClick={onToggleChat}
        className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
          chatOpen ? "text-vs-accent" : "text-vs-text-muted hover:text-vs-text-secondary"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3.5 3V13H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        </svg>
      </button>
    </nav>
  );
}
