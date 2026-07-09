import type { JSX } from "react";

/**
 * Full-color file-type icons for the Explorer — a distinct color + glyph per
 * type, in the spirit of a VS Code icon-theme extension. Every icon is an inline
 * SVG (bundled, no network) so it works offline. Extend `ICONS`/`byExt` to cover
 * more types.
 */

interface IconSpec {
  /** badge background */
  bg: string;
  /** glyph/label color */
  fg: string;
  /** 1–3 char label or symbol drawn in the badge */
  label: string;
  /** smaller font for 2–3 char labels */
  small?: boolean;
}

// Brand-ish colors per type; labels double as the recognizable glyph.
const T = {
  ts: { bg: "#3178c6", fg: "#fff", label: "TS", small: true },
  react: { bg: "#20232a", fg: "#61dafb", label: "⚛" },
  js: { bg: "#f7df1e", fg: "#000", label: "JS", small: true },
  json: { bg: "#cb9b00", fg: "#fff", label: "{ }", small: true },
  md: { bg: "#519aba", fg: "#fff", label: "M↓", small: true },
  css: { bg: "#2965f1", fg: "#fff", label: "#" },
  scss: { bg: "#cc6699", fg: "#fff", label: "#" },
  html: { bg: "#e34f26", fg: "#fff", label: "<>", small: true },
  yaml: { bg: "#cb171e", fg: "#fff", label: "Y" },
  img: { bg: "#a259ff", fg: "#fff", label: "◨" },
  lock: { bg: "#e8274b", fg: "#fff", label: "⚿" },
  env: { bg: "#6b7280", fg: "#ffd166", label: "⚙" },
  git: { bg: "#f1502f", fg: "#fff", label: "git", small: true },
  generic: { bg: "#8b94a3", fg: "#0b0c0e", label: "≡", small: true },
} as const satisfies Record<string, IconSpec>;

const byExt: Record<string, IconSpec> = {
  ts: T.ts,
  tsx: T.react,
  js: T.js,
  cjs: T.js,
  mjs: T.js,
  jsx: T.react,
  json: T.json,
  md: T.md,
  mdx: T.md,
  css: T.css,
  scss: T.scss,
  sass: T.scss,
  html: T.html,
  htm: T.html,
  yml: T.yaml,
  yaml: T.yaml,
  png: T.img,
  jpg: T.img,
  jpeg: T.img,
  gif: T.img,
  webp: T.img,
  svg: T.img,
  ico: T.img,
};

// Whole-name matches take priority (lockfiles, dotfiles, config).
const byName: Record<string, IconSpec> = {
  "package.json": T.json,
  "package-lock.json": T.lock,
  "pnpm-lock.yaml": T.lock,
  "yarn.lock": T.lock,
  ".gitignore": T.git,
  ".gitattributes": T.git,
  ".env": T.env,
  ".npmrc": T.env,
  ".nvmrc": T.env,
};

function specFor(name: string): IconSpec {
  if (name in byName) return byName[name]!;
  if (name.startsWith(".env")) return T.env;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return byExt[ext] ?? T.generic;
}

function Badge({ spec }: { spec: IconSpec }): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill={spec.bg} />
      <text
        x="8"
        y="8"
        dominantBaseline="central"
        textAnchor="middle"
        fill={spec.fg}
        fontFamily="'Geist Mono Variable', ui-monospace, monospace"
        fontWeight="700"
        fontSize={spec.small ? 6 : 8.5}
      >
        {spec.label}
      </text>
    </svg>
  );
}

function Folder({ open }: { open: boolean }): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3l1.4 1.6H13A1.5 1.5 0 0 1 14.5 5.6v6.4A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12z"
        fill={open ? "#5a7ea8" : "#4a5568"}
      />
      {open && <path d="M3 13.5 5 8h11l-2 5.5z" fill="#7aa0c9" />}
    </svg>
  );
}

export function FileIcon({
  name,
  isDir = false,
  open = false,
  className = "",
}: {
  name: string;
  isDir?: boolean;
  open?: boolean;
  className?: string;
}): JSX.Element {
  const dataIcon = isDir ? (open ? "folder-open" : "folder-closed") : specFor(name).label;
  return (
    <span
      data-icon={dataIcon}
      className={`inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center ${className}`}
    >
      {isDir ? <Folder open={open} /> : <Badge spec={specFor(name)} />}
    </span>
  );
}

/** Exposed for tests: the resolved icon label for a filename (glyph shown). */
export function iconLabelFor(name: string): string {
  return specFor(name).label;
}
