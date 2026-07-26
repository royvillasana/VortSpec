/**
 * File-level deterministic canvas write (change: instant-playground-edits).
 *
 * Wraps the pure codemods with I/O + the existing snapshot mechanism: capture the file,
 * run the resolvability guard, apply the requested op, write back. Returns the pre-edit
 * snapshot so undo/redo (Group 4) can restore it via `restoreFiles`. When the anchor isn't
 * statically resolvable the write is WITHHELD and a reason is returned — the caller keeps
 * the optimistic overlay and offers the assistant hand-off (never a silent AI run).
 */
import { join, resolve, relative, isAbsolute } from "node:path";
import { writeFile } from "node:fs/promises";
import { snapshotComponent } from "../inspector/component-reader";
import type { CanvasEdit, CanvasWriteResult } from "@vortspec/core/canvas-edit";
import {
  checkResolvability,
  setJsxAttr,
  setInlineStyle,
  setTextNode,
  insertComponent,
  deleteNode,
  duplicateNode,
  moveNode,
  moveNodeRelative,
  removeArrayItem,
  reorderArrayItem,
  CodemodError,
} from "./codemod";

export type { CanvasEdit, CanvasWriteResult };

/**
 * Security gate (red-team RT-1): `file` derives from the DOM's `data-source`, which is UNTRUSTED —
 * a project (or a hostile page) can render `data-source="../../../etc/passwd:1:1"`. Refuse anything
 * that escapes the project root or isn't a source file, BEFORE we read or write it. Path-traversal
 * and non-source targets are rejected here so no codemod ever touches a file outside the project.
 */
export function isEditableProjectFile(projectPath: string, file: string): boolean {
  if (typeof file !== "string" || file.length === 0) return false;
  const rel = relative(projectPath, resolve(projectPath, file));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return false; // escapes the project root
  return /\.(tsx|jsx|ts|js|mjs|cjs)$/.test(file);
}

export async function applyCanvasEdit(
  projectPath: string,
  file: string,
  edit: CanvasEdit,
): Promise<CanvasWriteResult> {
  if (!isEditableProjectFile(projectPath, file)) {
    return { ok: false, reason: `Refusing to edit "${file}" — it's outside the project or not a source file.` };
  }
  const snapshot = await snapshotComponent(projectPath, file);
  const before = snapshot.find((s) => s.path === file)?.content;
  if (before === undefined) return { ok: false, reason: `Couldn't read ${file}.` };
  // RT-4: ts-morph parses synchronously on the main process. Cap the file size so a pathological /
  // machine-generated source can't freeze the app on an edit. 2 MB is far above any hand-written
  // component; a real file that hits this should be edited in the assistant, not the canvas.
  if (before.length > 2_000_000) {
    return { ok: false, reason: "This file is too large to edit in the canvas — use the assistant." };
  }

  // List-data edits target a MAPPED element on purpose (un-resolvable as a single node) — they edit
  // the backing local array instead, so they skip the single-node resolvability guard; the codemod
  // withholds if the array isn't a local literal.
  const isListOp = edit.op === "listRemove" || edit.op === "listReorder";
  // The resolvability guard is a correctness gate: never rewrite an un-resolvable anchor.
  if (!isListOp) {
    const guard = checkResolvability(before, edit.anchor);
    if (!guard.resolvable) return { ok: false, reason: guard.reason };
  }
  // A relative move must also resolve its DROP target statically (not a list/conditional).
  if (edit.op === "move" && edit.position) {
    const tGuard = checkResolvability(before, edit.to);
    if (!tGuard.resolvable) return { ok: false, reason: tGuard.reason };
  }

  let after: string;
  try {
    switch (edit.op) {
      case "attr":
        after = setJsxAttr(before, edit.anchor, edit.name, edit.value);
        break;
      case "style":
        after = setInlineStyle(before, edit.anchor, edit.css);
        break;
      case "text":
        after = setTextNode(before, edit.anchor, edit.text);
        break;
      case "insert":
        after = insertComponent(before, edit.anchor, {
          name: edit.name,
          importFrom: edit.importFrom,
          index: edit.index,
        });
        break;
      case "delete":
        after = deleteNode(before, edit.anchor);
        break;
      case "listRemove":
        after = removeArrayItem(before, edit.anchor, edit.index);
        break;
      case "listReorder":
        after = reorderArrayItem(before, edit.anchor, edit.from, edit.to);
        break;
      case "duplicate":
        after = duplicateNode(before, edit.anchor);
        break;
      case "move":
        after = edit.position
          ? moveNodeRelative(before, edit.anchor, edit.to, edit.position)
          : moveNode(before, edit.anchor, edit.to, edit.index);
        break;
    }
  } catch (e) {
    return { ok: false, reason: e instanceof CodemodError ? e.message : `Edit failed: ${String(e)}` };
  }

  if (after !== before) await writeFile(join(projectPath, file), after, "utf8");
  return { ok: true, snapshot };
}
