import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTokenKeyMap, recordTokenKey, stampTokenKeys } from "./design-map";
import type { ResolveCandidate } from "./token-resolver";

describe("design-map — durable token→variableKey store (Plan B1)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-map-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns an empty map when none exists", async () => {
    expect(await readTokenKeyMap(dir)).toEqual({ tokens: {} });
  });

  it("records a join keyed by the normalized code-token name, and persists it", async () => {
    await recordTokenKey(dir, "--color-brand-primary", "VAR_KEY_1", "#0055FF");
    const map = await readTokenKeyMap(dir);
    expect(map.tokens["color-brand-primary"]).toEqual({ variableKey: "VAR_KEY_1", value: "#0055FF" });
    // written under .vortspec/maps/
    const raw = await readFile(join(dir, ".vortspec/maps/tokens.json"), "utf8");
    expect(JSON.parse(raw).tokens["color-brand-primary"].variableKey).toBe("VAR_KEY_1");
  });

  it("stamps code-token candidates with their recorded key for the resolver", async () => {
    await recordTokenKey(dir, "--space-4", "VAR_SPACE_4");
    const map = await readTokenKeyMap(dir);
    const candidates: ResolveCandidate[] = [
      { name: "--space-4", value: "16px" },
      { name: "--space-8", value: "32px" }, // no recorded key
    ];
    const stamped = stampTokenKeys(candidates, map);
    expect(stamped[0].key).toBe("VAR_SPACE_4");
    expect(stamped[1].key).toBeUndefined();
  });
});
