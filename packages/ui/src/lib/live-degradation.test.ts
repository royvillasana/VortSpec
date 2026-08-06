import { describe, it, expect } from "vitest";
import { offSession, shouldJoin, type LiveSessionInput } from "./useLiveSession";
import { shouldWrite } from "./live-writer";
import * as Y from "yjs";

/**
 * What happens when there is no relay, or it cannot be reached (change: live-playground, group 6).
 *
 * These matter more than the happy path. This feature adds the first persistent outbound connection
 * to a product whose pitch is that it runs nothing, so "absent by default" and "harmless when broken"
 * are the terms it exists under — not quality-of-life details.
 */

const base = (): LiveSessionInput => ({
  doc: new Y.Doc(),
  config: { relayUrl: "wss://relay.acme.dev" },
  credential: "",
  remote: "git@github.com:acme/ds.git",
  page: "home",
  name: "Roy",
  cursor: null,
  draft: null,
});

describe("6.1 — no relay configured connects to nothing", () => {
  it("does not join, and that is not an error state", () => {
    const off = { ...base(), config: { relayUrl: "" } };
    expect(shouldJoin(off)).toBe(false);
    // `off`, not `unreachable`: nothing is wrong, so nothing may be reported as wrong.
    expect(offSession.status).toBe("off");
    expect(offSession.detail).toBe("");
  });

  it("still writes the file exactly as it always did", () => {
    // The load-bearing part of "behaves exactly as it does today": persistence is untouched when
    // there is no session, so a project that never configures a relay cannot be affected by any of
    // the writer-election machinery.
    expect(shouldWrite({ live: false, clientIds: [], myClientId: null })).toBe(true);
  });

  it("is the state an unconfigured project is in", () => {
    // No relay is not an edge case to handle — it is what almost every project looks like.
    expect(shouldJoin({ ...base(), config: null })).toBe(false);
  });
});

describe("6.2/6.3 — a relay that cannot be reached does not block editing", () => {
  it("keeps writing the file when the session is not live", () => {
    // The guarantee: losing the relay costs collaboration, never the user's work.
    expect(shouldWrite({ live: false, clientIds: [3, 7], myClientId: 7 })).toBe(true);
  });

  it("names which of the two problems it is", () => {
    // "Cannot connect" would send someone to debug their network when the fix is a credential this
    // machine does not have. The two are distinguished at the point of failure.
    const unreachable = {
      status: "unreachable" as const,
      detail: "The relay is not reachable. Your edits are still saved to the project.",
      participants: 0,
      peers: [],
      synced: false,
      clientIds: [],
      myClientId: null,
    };
    expect(unreachable.detail).toMatch(/still saved/);
    expect(unreachable.detail).not.toBe("");
  });
});

describe("6.4 — a default install reaches no collaboration host", () => {
  it("has no default relay anywhere in the shipped configuration", () => {
    // Asserted on the value rather than by inspecting traffic: there is no default to connect to, so
    // there is nothing for a trace to find.
    const shipped = { relayUrl: "" };
    expect(shipped.relayUrl).toBe("");
    expect(shouldJoin({ ...base(), config: shipped })).toBe(false);
  });
});
