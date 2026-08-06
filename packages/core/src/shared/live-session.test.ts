import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { normalizeRemote, roomIdFor, roomIdentity, roomIdFromDigest } from "./live-session";

const digest = async (input: string): Promise<string> => createHash("sha256").update(input).digest("hex");

describe("the same repository is one room, however it was cloned", () => {
  // This is the property the feature dies on. Two people in different rooms see an empty page and no
  // error — nothing looks broken, so nobody reports it as broken.
  const SAME = [
    "git@github.com:acme/design-system.git",
    "git@github.com:acme/design-system",
    "https://github.com/acme/design-system.git",
    "https://github.com/acme/design-system",
    "https://github.com/acme/design-system/",
    "https://roy@github.com/acme/design-system.git",
    "ssh://git@github.com/acme/design-system.git",
    "  https://github.com/acme/design-system.git  ",
    "https://GitHub.com/acme/design-system.git",
  ];

  for (const remote of SAME) {
    it(`normalizes ${remote.trim()}`, () => {
      expect(normalizeRemote(remote)).toBe("github.com/acme/design-system");
    });
  }

  it("puts every clone form in one room", async () => {
    const rooms = new Set<string | null>();
    for (const remote of SAME) rooms.add(await roomIdFor(remote, "home", digest));
    expect(rooms.size).toBe(1);
  });
});

describe("different things are different rooms", () => {
  it("separates two pages of one project", async () => {
    const remote = "git@github.com:acme/design-system.git";
    expect(await roomIdFor(remote, "home", digest)).not.toBe(await roomIdFor(remote, "pricing", digest));
  });

  it("separates two projects", async () => {
    expect(await roomIdFor("git@github.com:acme/a.git", "home", digest)).not.toBe(
      await roomIdFor("git@github.com:acme/b.git", "home", digest),
    );
  });

  it("keeps a case-different path separate", () => {
    // The host is case-insensitive but the path is not: on a case-sensitive host these are two
    // repositories, and merging them would put two teams in one session.
    expect(normalizeRemote("https://github.com/Acme/Repo.git")).toBe("github.com/Acme/Repo");
    expect(normalizeRemote("https://github.com/acme/repo.git")).toBe("github.com/acme/repo");
  });

  it("ignores the port, which is not part of the repository's identity", () => {
    expect(normalizeRemote("ssh://git@git.acme.com:2222/team/repo.git")).toBe("git.acme.com/team/repo");
  });
});

describe("no remote means no session", () => {
  it("returns null rather than a room", async () => {
    expect(await roomIdFor("", "home", digest)).toBeNull();
    expect(await roomIdFor("   ", "home", digest)).toBeNull();
    expect(roomIdentity("", "home")).toBeNull();
  });

  it("returns null without a page", async () => {
    expect(await roomIdFor("git@github.com:acme/a.git", "", digest)).toBeNull();
  });
});

describe("the room id does not disclose the repository", () => {
  it("is a digest, not the identity", async () => {
    const room = await roomIdFor("git@github.com:acme/secret-client-work.git", "home", digest);
    expect(room).not.toContain("acme");
    expect(room).not.toContain("secret-client-work");
    expect(room).not.toContain("github");
  });

  it("is stable — a room id is a protocol once deployed", async () => {
    // Pinned deliberately: changing how this is derived silently splits everyone who upgrades from
    // everyone who has not, and the symptom is an empty page rather than an error.
    expect(await roomIdFor("git@github.com:acme/design-system.git", "home", digest)).toBe(
      roomIdFromDigest(await digest("github.com/acme/design-system#home")),
    );
  });

  it("is short enough to read in a log and long enough not to collide", async () => {
    const room = await roomIdFor("git@github.com:acme/a.git", "home", digest);
    expect(room).toMatch(/^vs-[0-9a-f]{32}$/);
  });
});
