import { describe, expect, it } from "vitest";
import { sep } from "node:path";
import { toUnpacked } from "./setup-manager";

// The bug: fs.cp/opendir aren't asar-aware, so a bundled-toolkit path inside
// app.asar throws ENOTDIR. toUnpacked redirects to the unpacked twin.
describe("toUnpacked", () => {
  it("maps an app.asar path to its app.asar.unpacked twin", () => {
    const asar = ["", "Applications", "VortSpec.app", "Contents", "Resources", "app.asar", "node_modules", "@royvillasana", "sdd-de"].join(sep);
    const expected = asar.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
    expect(toUnpacked(asar)).toBe(expected);
    expect(toUnpacked(asar)).toContain(`app.asar.unpacked${sep}`);
  });

  it("leaves an already-unpacked path unchanged", () => {
    const unpacked = ["", "app", "app.asar.unpacked", "node_modules", "@royvillasana", "sdd-de"].join(sep);
    expect(toUnpacked(unpacked)).toBe(unpacked);
  });

  it("leaves a dev (non-asar) node_modules path unchanged", () => {
    const dev = ["", "repo", "node_modules", ".pnpm", "@royvillasana+sdd-de@1.8.4", "node_modules", "@royvillasana", "sdd-de"].join(sep);
    expect(toUnpacked(dev)).toBe(dev);
  });
});
