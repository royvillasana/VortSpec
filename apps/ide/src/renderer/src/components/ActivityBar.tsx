import type { JSX } from "react";
import type { Activity } from "../lib/layout";

/** Activity-bar keys: every layout Activity plus `home`, which is an ACTION
 *  (return to the project picker) rather than a panel — so it is not part of the
 *  layout `Activity` union. */
export type NavKey = Activity | "home";

/** The IDE's single navigation. Explorer opens the primary sidebar; the rest
 *  open a full-center panel. Every icon carries a hover tooltip (title + label).
 *  `custom` renders a full (e.g. brand-colored) SVG instead of the monochrome one. */
type Item = { key: NavKey; label: string; icon?: JSX.Element; custom?: JSX.Element };

/** Home — a house mark (svgrepo), filled, in currentColor. */
const HomeMark = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3.172 3 10.657V21a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1V10.657l-9-7.485Zm9.6 6.09L12.64 1.81a1 1 0 0 0-1.28 0L2.4 9.262a1 1 0 0 0 1.28 1.535L12 3.86l8.32 6.937a1 1 0 1 0 1.28-1.535Z" />
  </svg>
);

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

/** Playground — a browser/webpage-with-preview mark (svgrepo "design-seo-and-web"). */
const PlaygroundMark = (
  <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
    <path d="M473.025,123.581c9.864,0,17.86-7.997,17.86-17.86V17.86c0-9.864-7.997-17.86-17.86-17.86h-87.846c-9.864,0-17.86,7.997-17.86,17.86v26.063H144.683V17.86c0-9.864-7.997-17.86-17.86-17.86H38.975c-9.864,0-17.86,7.997-17.86,17.86v87.86c0,9.864,7.997,17.86,17.86,17.86h26.063V388.42H38.975c-9.864,0-17.86,7.997-17.86,17.86v87.859c0,9.864,7.997,17.86,17.86,17.86h87.847c9.864,0,17.86-7.997,17.86-17.86v-26.063h222.634v26.063c0,9.864,7.997,17.86,17.86,17.86h87.846c9.864,0,17.86-7.997,17.86-17.86v-87.86c0-9.864-7.997-17.86-17.86-17.86h-26.063V123.581H473.025z M56.836,87.86V35.721h52.126c0,5.516,0,46.612,0,52.139C103.469,87.86,62.36,87.86,56.836,87.86z M108.962,476.279H56.836V424.14c5.49,0,46.603,0,52.126,0C108.962,429.66,108.962,470.759,108.962,476.279z M385.178,388.419c-9.864,0-17.86,7.997-17.86,17.86v26.076H144.683v-26.076c0-9.864-7.997-17.86-17.86-17.86h-26.063V123.581h26.063c9.864,0,17.86-7.997,17.86-17.86V79.645h222.634v26.076c0,9.864,7.997,17.86,17.86,17.86h26.063v264.837H385.178z M455.164,424.14v52.139h-52.125c0-5.516,0-46.611,0-52.139C410.58,424.14,447.594,424.14,455.164,424.14z M403.038,87.86c0-5.524,0-46.634,0-52.139h52.125V87.86C447.623,87.86,410.609,87.86,403.038,87.86z" />
    <path d="M336.492,128.511H175.508c-9.864,0-17.86,7.997-17.86,17.86v101.602c0,9.572,7.731,17.86,17.945,17.86h160.9c9.864,0,17.86-7.997,17.86-17.86V146.371C354.353,136.413,346.192,128.511,336.492,128.511z M193.368,164.232h81.36l-81.36,51.349V164.232z M318.631,230.113h-81.36l81.36-51.349V230.113z" />
    <path d="M336.492,288.313H175.508c-9.864,0-17.86,7.997-17.86,17.86c0,9.864,7.997,17.86,17.86,17.86h160.985c9.864,0,17.86-7.997,17.86-17.86C354.353,296.31,346.356,288.313,336.492,288.313z" />
    <path d="M336.492,347.768H175.508c-9.864,0-17.86,7.997-17.86,17.86c0,9.864,7.997,17.86,17.86,17.86h160.985c9.864,0,17.86-7.997,17.86-17.86S346.356,347.768,336.492,347.768z" />
  </svg>
);

/** Design tokens — a cube/hexagon token mark (svgrepo "token"), stroked. */
const TokenMark = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21L5.04743 17.234C4.40205 16.8844 4 16.2094 4 15.4754V7.66667M12 21L18.9526 17.234C19.598 16.8844 20 16.2094 20 15.4754L20 7.66667M12 21V15M4 7.66667L11.0761 3.98118C11.6551 3.67962 12.3449 3.67962 12.9239 3.98118L20 7.66667M4 7.66667L9.36162 10.5709M20 7.66667L14.6384 10.5709M12 15C13.6569 15 15 13.6569 15 12C15 11.4826 14.869 10.9958 14.6384 10.5709M12 15C10.3431 15 9 13.6569 9 12C9 11.4826 9.13099 10.9958 9.36162 10.5709M14.6384 10.5709C14.1305 9.63523 13.1394 9 12 9C10.8606 9 9.8695 9.63523 9.36162 10.5709" />
  </svg>
);

/** Design manifest — an "MD document" mark (Noun Project "md" by JunGSa) for the DESIGN.md manifest. */
const ManifestMark = (
  <svg width="18" height="18" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
    <rect x="16" y="17.061" width="17.71" height="2" />
    <rect x="30.29" y="30.248" width="17.71" height="2" />
    <rect x="16" y="21.455" width="32" height="2" />
    <rect x="16" y="25.851" width="32" height="2" />
    <path d="M38.2,50.913a1.919,1.919,0,0,0-1.638-.7H35.546v5.664h.988a2.342,2.342,0,0,0,1.09-.224,1.727,1.727,0,0,0,.675-.617,2.61,2.61,0,0,0,.343-.908,5.967,5.967,0,0,0,.1-1.095,4.926,4.926,0,0,0-.138-1.24A2.494,2.494,0,0,0,38.2,50.913Z" />
    <path d="M54,43.67V17.376l-.293-.293L39.417,2.793,39.124,2.5H14a4,4,0,0,0-4,4V40.242a1.991,1.991,0,0,0-1,1.722V56.5a5.006,5.006,0,0,0,5,5H50a5.006,5.006,0,0,0,5-5V45.393A1.991,1.991,0,0,0,54,43.67ZM32.318,57.507h-1.7V51.423l-1.74,6.084H27.422l-1.716-6.072v6.072H24V48.579h2.557l1.584,5.736,1.595-5.736h2.58ZM40.4,54.945a3.5,3.5,0,0,1-.79,1.4,3.845,3.845,0,0,1-3.025,1.164H33.639V48.579h2.918a4.8,4.8,0,0,1,1.835.318,3.3,3.3,0,0,1,1.274.906,3.758,3.758,0,0,1,.741,1.41,6.6,6.6,0,0,1,.239,1.842A6.457,6.457,0,0,1,40.4,54.945ZM52,43.393H30.086l-2.4-2.746a2,2,0,0,0-1.505-.683H12V6.5a2,2,0,0,1,2-2H37.71V14.79a4,4,0,0,0,4,4H52Z" />
  </svg>
);

/** SDD-DE pipeline — an "import into a document" badged mark (svgrepo "import-outline-badged"). */
const SddPipelineMark = (
  <svg width="18" height="18" viewBox="0 0 36 36" fill="currentColor" aria-hidden="true">
    <path d="M11.94,26.28a1,1,0,1,0,1.41,1.41L19,22l-5.68-5.68a1,1,0,0,0-1.41,1.41L15.2,21H3a1,1,0,1,0,0,2H15.23Z" />
    <path d="M28,13.22V30H8a2,2,0,0,0,2,2H28a2,2,0,0,0,2-2V13.5A7.49,7.49,0,0,1,28,13.22Z" />
    <path d="M10,13.61h7.61V6H22.5a7.49,7.49,0,0,1,.28-2H14.87L8,10.86V15h2Zm0-1.92L15.7,6H16v6H10Z" />
    <circle cx="30" cy="6" r="5" />
  </svg>
);

// Order (top → bottom): Home, Explorer, Playground, Tokens, Design manifest,
// Storybook, Jira (Tasks), Git (Source Control), SDD-DE pipeline.
const TOP: Item[] = [
  {
    key: "home",
    label: "Home — back to your projects",
    custom: HomeMark,
  },
  {
    key: "explorer",
    label: "Explorer",
    icon: <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4l2 2.5h5A1.5 1.5 0 0 1 17 7v8.5A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-11Z" />,
  },
  {
    key: "run",
    label: "Playground",
    custom: PlaygroundMark,
  },
  {
    key: "tokens",
    label: "Design tokens",
    custom: TokenMark,
  },
  {
    key: "manifest",
    label: "Design manifest",
    custom: ManifestMark,
  },
  {
    key: "play",
    label: "Storybook",
    custom: StorybookMark,
  },
  {
    key: "tasks",
    label: "Tasks",
    custom: JiraMark,
  },
  {
    key: "source",
    label: "Source Control",
    custom: GitMark,
  },
  {
    key: "flow",
    label: "SDD-DE pipeline",
    custom: SddPipelineMark,
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
}: {
  active: NavKey;
  onSelect: (key: NavKey) => void;
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
    </nav>
  );
}
