import { describe, it, expect } from "vitest";
import {
  credentialFor,
  hasRelay,
  normalizeRelayUrl,
  relayUrlProblem,
  collabConfigSchema,
} from "./collab-config";

describe("a secret can never be stored where it would be committed", () => {
  // The point of this module. Everything else here is housekeeping.
  it("refuses an address carrying credentials", () => {
    expect(relayUrlProblem("wss://roy:hunter2@relay.acme.dev")).toBe("has-credentials");
    expect(relayUrlProblem("wss://roy@relay.acme.dev")).toBe("has-credentials");
  });

  it("refuses a token in the query string", () => {
    for (const param of ["token", "secret", "key", "access_token", "api_key", "password"]) {
      expect(relayUrlProblem(`wss://relay.acme.dev?${param}=abc123`), param).toBe("has-query-secret");
    }
  });

  it("refuses it regardless of case", () => {
    expect(relayUrlProblem("wss://relay.acme.dev?TOKEN=abc")).toBe("has-query-secret");
  });

  it("does not merely strip the secret and accept the rest", () => {
    // Stripping would be friendlier and wrong: the user would believe the address they typed works,
    // and the secret would have been in their clipboard, their shell history, and this input.
    expect(relayUrlProblem("wss://roy:hunter2@relay.acme.dev")).not.toBeNull();
  });
});

describe("ordinary addresses", () => {
  it("accepts ws and wss", () => {
    expect(relayUrlProblem("wss://relay.acme.dev")).toBeNull();
    expect(relayUrlProblem("ws://localhost:1234")).toBeNull();
    expect(relayUrlProblem("wss://relay.acme.dev/collab")).toBeNull();
  });

  it("rejects a non-websocket scheme", () => {
    expect(relayUrlProblem("https://relay.acme.dev")).toBe("not-websocket");
  });

  it("rejects nonsense", () => {
    expect(relayUrlProblem("relay.acme.dev")).toBe("unparseable");
  });

  it("treats no relay as valid — it is the default state, not a misconfiguration", () => {
    expect(relayUrlProblem("")).toBeNull();
    expect(relayUrlProblem("   ")).toBeNull();
    expect(hasRelay({ relayUrl: "" })).toBe(false);
    expect(hasRelay(null)).toBe(false);
    expect(hasRelay({ relayUrl: "wss://relay.acme.dev" })).toBe(true);
  });

  it("does not treat an invalid address as a relay", () => {
    expect(hasRelay({ relayUrl: "https://relay.acme.dev" })).toBe(false);
  });

  it("defaults an absent config to no relay", () => {
    expect(collabConfigSchema.parse({})).toEqual({ relayUrl: "" });
  });
});

describe("finding this machine's credential", () => {
  const creds = { "wss://Relay.Acme.dev/": "s3cret" };

  it("matches despite a trailing slash or host casing", () => {
    // Otherwise a user who has already entered their secret is rejected with no way to see why.
    expect(credentialFor(creds, "wss://relay.acme.dev")).toBe("s3cret");
    expect(credentialFor(creds, "wss://relay.acme.dev/")).toBe("s3cret");
    expect(credentialFor(creds, "WSS://RELAY.ACME.DEV")).toBe("s3cret");
  });

  it("does not match a different relay", () => {
    expect(credentialFor(creds, "wss://other.acme.dev")).toBe("");
    expect(credentialFor(creds, "wss://relay.acme.dev/other")).toBe("");
  });

  it("returns empty when this machine has none — a normal state, not an error", () => {
    expect(credentialFor({}, "wss://relay.acme.dev")).toBe("");
  });

  it("keeps the path, which distinguishes two relays on one host", () => {
    expect(normalizeRelayUrl("wss://acme.dev/team-a/")).toBe("wss://acme.dev/team-a");
    expect(normalizeRelayUrl("wss://acme.dev/team-b")).toBe("wss://acme.dev/team-b");
  });
});
