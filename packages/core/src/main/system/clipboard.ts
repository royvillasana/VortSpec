import { clipboard } from "electron";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Read an image from the OS clipboard (e.g. a screenshot the user copied) and
 * persist it as a temp PNG so the assistant can read it by path. Returns the
 * absolute file path plus a small data-URL thumbnail for the composer chip, or
 * `null` when the clipboard holds no image (text/empty → let the textarea paste).
 */
let seq = 0;

export function readClipboardImage(): { path: string; dataUrl: string } | null {
  const img = clipboard.readImage();
  if (img.isEmpty()) return null;
  const dir = join(tmpdir(), "vortspec-paste");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `paste-${Date.now()}-${seq++}.png`);
  writeFileSync(path, img.toPNG());
  // Thumbnail: cap the width so the chip preview data-URL stays small.
  const { width } = img.getSize();
  const thumb = width > 220 ? img.resize({ width: 220 }) : img;
  return { path, dataUrl: thumb.toDataURL() };
}
