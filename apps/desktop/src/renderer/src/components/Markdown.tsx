import { Fragment } from "react";

/**
 * A small, dependency-free Markdown renderer for artifact documents (specs,
 * briefs, verify reports). Handles headings, paragraphs, bullet/ordered lists,
 * fenced code, pipe tables, and inline bold / `code`. Not a full CommonMark
 * implementation — just what SDD-DE artifacts use.
 */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  return <div className="flex flex-col gap-4">{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): React.JSX.Element[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: React.JSX.Element[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) body.push(lines[i++]);
      i++; // closing fence
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-md border border-vs-border-default bg-black/40 p-3 font-mono text-[12px] leading-relaxed text-vs-text-secondary"
        >
          {body.join("\n")}
        </pre>,
      );
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "text-2xl font-semibold tracking-[-0.02em] text-vs-text-primary"
          : level === 2
            ? "mt-2 text-[12px] font-semibold uppercase tracking-wide text-vs-text-muted"
            : "text-sm font-semibold text-vs-text-primary";
      out.push(
        <p key={key++} className={cls}>
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }

    // pipe table
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:|-]+\|?$/)) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      out.push(renderTable(rows, key++));
      continue;
    }

    // list (bulleted or ordered)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      out.push(
        <ListTag
          key={key++}
          className={`flex flex-col gap-1.5 pl-5 text-sm text-vs-text-secondary ${
            ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {items.map((it, n) => (
            <li key={n}>{inline(it)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph (gather until blank / block start)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^(#{1,4})\s/) &&
      !lines[i].trimStart().startsWith("```") &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("|")
    ) {
      para.push(lines[i++]);
    }
    out.push(
      <p key={key++} className="text-sm leading-relaxed text-vs-text-secondary">
        {inline(para.join(" "))}
      </p>,
    );
  }
  return out;
}

function renderTable(rows: string[], key: number): React.JSX.Element {
  const cells = (r: string): string[] =>
    r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return (
    <div key={key} className="overflow-x-auto rounded-md border border-vs-border-default">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-vs-bg-surface">
            {header.map((c, n) => (
              <th
                key={n}
                className="border-b border-vs-border-default px-3 py-2 text-left font-medium text-vs-text-secondary"
              >
                {inline(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="border-b border-vs-border-subtle last:border-0">
              {row.map((c, n) => (
                <td key={n} className="px-3 py-2 align-top text-vs-text-secondary">
                  {inline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Inline: **bold** and `code`. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="font-semibold text-vs-text-primary">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={i} className="rounded bg-vs-bg-elevated px-1 py-0.5 font-mono text-[12px] text-vs-text-primary">
          {p.slice(1, -1)}
        </code>
      );
    return <Fragment key={i}>{p}</Fragment>;
  });
}
