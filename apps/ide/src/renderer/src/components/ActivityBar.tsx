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

/** Design manifest — a design-studio artboard mark (svgrepo "design-studio"), filled. */
const DesignStudioMark = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17,6 L17,16.2792476 L18.5,17.7902865 L20,16.2792476 L20,6 L17,6 Z M17,5 L20,5 L20,3.01471863 L17,3.01471863 L17,5 Z M21,7 L21,16.4852814 C21,16.6172545 20.9478236,16.7438756 20.8548472,16.8375362 L18.8548472,18.8522548 C18.6592928,19.0492484 18.3407072,19.0492484 18.1451528,18.8522548 L16.1451528,16.8375362 C16.0521764,16.7438756 16,16.6172545 16,16.4852814 L16,14 L15.5,14 C14.6715729,14 14,13.3284271 14,12.5 L14,9.5 C14,8.67157288 14.6715729,8 15.5,8 L16,8 L16,7 L6,7 L6,14.5 C6,14.7761424 5.77614237,15 5.5,15 L5,15 C3.34314575,15 2,16.3431458 2,18 C2,19.6568542 3.34314575,21 5,21 L22,21 L22,7 L21,7 Z M21,6 L22.5,6 C22.7761424,6 23,6.22385763 23,6.5 L23,21.5 C23,21.7761424 22.7761424,22 22.5,22 L5,22 C2.790861,22 1,20.209139 1,18 L1,6.5 C1,4.01471863 3.01471863,2 5.5,2 C5.77614237,2 6,2.22385763 6,2.5 L6,6 L16,6 L16,2.51471863 C16,2.23857625 16.2238576,2.01471863 16.5,2.01471863 L20.5,2.01471863 C20.7761424,2.01471863 21,2.23857625 21,2.51471863 L21,6 Z M16,9 L15.5,9 C15.2238576,9 15,9.22385763 15,9.5 L15,12.5 C15,12.7761424 15.2238576,13 15.5,13 L16,13 L16,9 Z M2,15.3541756 C2.73294445,14.5237549 3.80530747,14 5,14 L5,3.03544443 C3.30385293,3.27805926 2,4.73676405 2,6.5 L2,15.3541756 L2,15.3541756 Z M8.5,8 L11.5,8 C12.3284271,8 13,8.67157288 13,9.5 L13,12.5 C13,13.3284271 12.3284271,14 11.5,14 L8.5,14 C7.67157288,14 7,13.3284271 7,12.5 L7,9.5 C7,8.67157288 7.67157288,8 8.5,8 Z M8.5,9 C8.22385763,9 8,9.22385763 8,9.5 L8,12.5 C8,12.7761424 8.22385763,13 8.5,13 L11.5,13 C11.7761424,13 12,12.7761424 12,12.5 L12,9.5 C12,9.22385763 11.7761424,9 11.5,9 L8.5,9 Z M7.5,17 C7.22385763,17 7,16.7761424 7,16.5 C7,16.2238576 7.22385763,16 7.5,16 L14.5,16 C14.7761424,16 15,16.2238576 15,16.5 C15,16.7761424 14.7761424,17 14.5,17 L7.5,17 Z M7.5,19 C7.22385763,19 7,18.7761424 7,18.5 C7,18.2238576 7.22385763,18 7.5,18 L15.5,18 C15.7761424,18 16,18.2238576 16,18.5 C16,18.7761424 15.7761424,19 15.5,19 L7.5,19 Z" />
  </svg>
);

// Order (top → bottom): Playground, Tokens, Design manifest, Storybook, Explorer,
// Jira (Tasks), Git (Source Control), SDD-DE pipeline.
const TOP: Item[] = [
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
    custom: DesignStudioMark,
  },
  {
    key: "play",
    label: "Storybook",
    custom: StorybookMark,
  },
  {
    key: "explorer",
    label: "Explorer",
    icon: <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4l2 2.5h5A1.5 1.5 0 0 1 17 7v8.5A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-11Z" />,
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
    icon: <path d="M5 4h10M5 4a1.5 1.5 0 1 1 0 .01M5 10h10M15 10a1.5 1.5 0 1 1 0 .01M5 16h10M5 16a1.5 1.5 0 1 1 0 .01M5 5.5v3M15 11.5v3" />,
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
