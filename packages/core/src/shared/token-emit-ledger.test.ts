import { describe, expect, it } from "vitest";
import {
  describeDivergence,
  nextTokenEmitLedger,
  parseTokenEmitLedger,
  planTokenEmit,
  serializeTokenEmitLedger,
  type TokenEmitCandidate,
  type TokenEmitLedger,
} from "./token-emit-ledger";

const TOKEN_FILE = "src/styles/tokens.css";

function candidate(overrides: Partial<TokenEmitCandidate> = {}): TokenEmitCandidate {
  return {
    path: TOKEN_FILE,
    role: "token-file",
    nextHash: "next",
    currentHash: "next",
    ...overrides,
  };
}

function ledger(hash: string, path = TOKEN_FILE): TokenEmitLedger {
  return {
    version: 1,
    styling: "css",
    format: "css",
    entries: [{ path, role: "token-file", hash }],
  };
}

function plan(candidates: TokenEmitCandidate[], led: TokenEmitLedger | null, onDivergence?: "overwrite" | "keep") {
  return planTokenEmit(
    { format: "css", styling: "css", candidates, ledger: led },
    onDivergence ? { onDivergence } : {},
  );
}

describe("planTokenEmit", () => {
  it("creates a token file that does not exist yet", () => {
    const result = plan([candidate({ currentHash: null })], null);
    expect(result.files[0]?.disposition).toBe("create");
    expect(result.diverged).toEqual([]);
    expect(result.upToDate).toBe(false);
  });

  it("reports unchanged when the emitted bytes match what we last wrote", () => {
    const result = plan([candidate({ currentHash: "next", nextHash: "next" })], ledger("next"));
    expect(result.files[0]?.disposition).toBe("unchanged");
    expect(result.upToDate).toBe(true);
  });

  it("updates a file we own when the canonical artifact changed", () => {
    const result = plan([candidate({ currentHash: "old", nextHash: "new" })], ledger("old"));
    expect(result.files[0]?.disposition).toBe("update");
    expect(result.upToDate).toBe(false);
  });

  it("refuses to overwrite a file that was hand-edited since the last emit", () => {
    const result = plan([candidate({ currentHash: "hand-edited", nextHash: "new" })], ledger("old"));
    expect(result.files[0]?.disposition).toBe("diverged");
    expect(result.diverged).toEqual([TOKEN_FILE]);
    expect(result.files[0]?.ledgerHash).toBe("old");
  });

  it("refuses a pre-existing token file it has no record of writing", () => {
    // The project's own hand-authored theme, from before VortSpec ever ran: never assume ownership.
    const result = plan([candidate({ currentHash: "theirs", nextHash: "new" })], null);
    expect(result.files[0]?.disposition).toBe("diverged");
  });

  it("overwrites a divergence only when told to explicitly", () => {
    const result = plan([candidate({ currentHash: "hand-edited", nextHash: "new" })], ledger("old"), "overwrite");
    expect(result.files[0]?.disposition).toBe("update");
    expect(result.diverged).toEqual([]);
  });

  it("keeps a divergence when told to, without writing", () => {
    const result = plan([candidate({ currentHash: "hand-edited", nextHash: "new" })], ledger("old"), "keep");
    expect(result.files[0]?.disposition).toBe("kept");
    expect(result.diverged).toEqual([]);
  });

  it("plans each file of a multi-file emit independently", () => {
    const result = plan(
      [
        candidate({ currentHash: "old", nextHash: "new" }),
        candidate({ path: "src/styles/vars.css", role: "custom-properties", currentHash: null, nextHash: "v" }),
      ],
      ledger("old"),
    );
    expect(result.files.map((file) => file.disposition)).toEqual(["update", "create"]);
  });

  it("names every diverged file and the way out in its message", () => {
    const result = plan([candidate({ currentHash: "hand-edited", nextHash: "new" })], ledger("old"));
    const message = describeDivergence(result);
    expect(message).toContain(TOKEN_FILE);
    expect(message).toContain("overwrite");
    expect(message).toContain("keep");
  });
});

describe("nextTokenEmitLedger", () => {
  it("records what it just wrote", () => {
    const result = plan([candidate({ currentHash: null, nextHash: "new" })], null);
    expect(nextTokenEmitLedger(result).entries).toEqual([
      { path: TOKEN_FILE, role: "token-file", hash: "new" },
    ]);
  });

  it("does NOT adopt a kept file — the next run must ask again rather than silently overwrite it", () => {
    const previous = ledger("old");
    const result = plan([candidate({ currentHash: "hand-edited", nextHash: "new" })], previous, "keep");
    const next = nextTokenEmitLedger(result, previous);
    expect(next.entries).toEqual(previous.entries);
    // Proof of the guarantee: re-planning against the new ledger still reports a divergence.
    expect(plan([candidate({ currentHash: "hand-edited", nextHash: "newer" })], next).diverged).toEqual([
      TOKEN_FILE,
    ]);
  });

  it("carries forward a file an earlier styling emitted, so switching back is not a false divergence", () => {
    const previous = ledger("tw", "tailwind.config.js");
    const result = plan([candidate({ currentHash: null, nextHash: "new" })], previous);
    const next = nextTokenEmitLedger(result, previous);
    expect(next.entries.map((entry) => entry.path)).toEqual(["src/styles/tokens.css", "tailwind.config.js"]);
  });

  it("serializes in a stable order regardless of the order the emitter produced files", () => {
    const forwards = plan(
      [
        candidate({ path: "a.css", currentHash: null, nextHash: "a" }),
        candidate({ path: "b.css", currentHash: null, nextHash: "b" }),
      ],
      null,
    );
    const backwards = plan(
      [
        candidate({ path: "b.css", currentHash: null, nextHash: "b" }),
        candidate({ path: "a.css", currentHash: null, nextHash: "a" }),
      ],
      null,
    );
    expect(serializeTokenEmitLedger(nextTokenEmitLedger(forwards))).toBe(
      serializeTokenEmitLedger(nextTokenEmitLedger(backwards)),
    );
  });
});

describe("parseTokenEmitLedger", () => {
  it("round-trips a serialized ledger", () => {
    const led = ledger("old");
    expect(parseTokenEmitLedger(JSON.parse(serializeTokenEmitLedger(led)))).toEqual(led);
  });

  it("treats a corrupt or unknown-version ledger as no ledger, so nothing is presumed owned", () => {
    expect(parseTokenEmitLedger({ version: 2, entries: [] })).toBeNull();
    expect(parseTokenEmitLedger("not a ledger")).toBeNull();
    expect(parseTokenEmitLedger(null)).toBeNull();
  });
});
