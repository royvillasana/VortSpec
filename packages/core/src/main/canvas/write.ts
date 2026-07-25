/**
 * File-level deterministic canvas write (change: instant-playground-edits).
 *
 * Wraps the pure codemods with I/O + the existing snapshot mechanism: capture the file,
 * run the resolvability guard, apply the requested op, write back. Returns the pre-edit
 * snapshot so undo/redo (Group 4) can restore it via `restoreFiles`. When the anchor isn't
 * statically resolvable the write is WITHHELD and a reason is returned — the caller keeps
 * the optimistic overlay and offers the assistant hand-off (never a silent AI run).
 */
import { join } from "node:path";
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
  CodemodError,
} from "./codemod";

export type { CanvasEdit, CanvasWriteResult };

export async function applyCanvasEdit(
  projectPath: string,
  file: string,
  edit: CanvasEdit,
): Promise<CanvasWriteResult> {
  const snapshot = await snapshotComponent(projectPath, file);
  const before = snapshot.find((s) => s.path === file)?.content;
  if (before === undefined) return { ok: false, reason: `Couldn't read ${file}.` };

  // The resolvability guard is a correctness gate: never rewrite an un-resolvable anchor.
  const guard = checkResolvability(before, edit.anchor);
  if (!guard.resolvable) return { ok: false, reason: guard.reason };
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
