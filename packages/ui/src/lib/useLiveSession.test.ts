import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { shouldJoin, offSession, type LiveSessionInput } from "./useLiveSession";

const base = (): LiveSessionInput => ({
  doc: new Y.Doc(),
  config: { relayUrl: "wss://relay.acme.dev" },
  credential: "",
  remote: "git@github.com:acme/design-system.git",
  page: "home",
  name: "Roy",
  cursor: null,
  draft: null,
});

describe("a session is joined only when everything is in place", () => {
  it("joins when it is", () => {
    expect(shouldJoin(base())).toBe(true);
  });

  it("joins a relay that needs no credential", () => {
    // An open relay on a trusted network is a supported deployment; a missing secret is not a reason
    // to refuse to connect.
    expect(shouldJoin({ ...base(), credential: "" })).toBe(true);
  });
});

describe("no relay configured connects to nothing", () => {
  // The requirement this feature is allowed to exist under: a default install, opening a project
  // nobody has configured, must reach no collaboration host at all.
  it("does not join without a relay", () => {
    expect(shouldJoin({ ...base(), config: { relayUrl: "" } })).toBe(false);
    expect(shouldJoin({ ...base(), config: null })).toBe(false);
  });

  it("does not join on an unusable relay address", () => {
    // A malformed address is not a reason to try anyway.
    expect(shouldJoin({ ...base(), config: { relayUrl: "https://relay.acme.dev" } })).toBe(false);
    expect(shouldJoin({ ...base(), config: { relayUrl: "relay.acme.dev" } })).toBe(false);
  });

  it("does not join a framework page", () => {
    expect(shouldJoin({ ...base(), page: null })).toBe(false);
  });

  it("does not join without a git remote", () => {
    expect(shouldJoin({ ...base(), remote: "" })).toBe(false);
    expect(shouldJoin({ ...base(), remote: "   " })).toBe(false);
  });

  it("does not join a page that could not be adopted", () => {
    expect(shouldJoin({ ...base(), doc: null })).toBe(false);
  });
});

describe("the off state", () => {
  it("is not an error", () => {
    // `off` is the normal state for almost every project, so nothing may render it as a failure.
    expect(offSession.status).toBe("off");
    expect(offSession.detail).toBe("");
    expect(offSession.participants).toBe(0);
    expect(offSession.peers).toEqual([]);
    expect(offSession.synced).toBe(false);
    expect(offSession.clientIds).toEqual([]);
    expect(offSession.myClientId).toBeNull();
  });
});
