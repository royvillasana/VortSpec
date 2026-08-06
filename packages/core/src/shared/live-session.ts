/**
 * Session identity for the live Playground (OpenSpec change: live-playground, task 2.2).
 *
 * A room is "this repository, this page". That comes straight from what these users already mean by
 * the same project — they share a git remote — so it needs no registry, no ids to exchange, and no way
 * to wander into a stranger's session by guessing a name. A project with no remote gets no session,
 * which is consistent: it also cannot share comments, push, or pull.
 *
 * Two properties carry the whole design, and both are easy to get wrong:
 *
 * 1. **The same repository must produce the same room however it was cloned.** One person clones over
 *    SSH, another over HTTPS, a third pasted a URL with a trailing `.git` or a username in it. If the
 *    room came from the remote as written, those people would sit in four different rooms, each seeing
 *    an empty page and no error — the worst possible failure, because everything looks fine.
 * 2. **The relay should not learn where anyone works.** The room is the hash of the identity, not the
 *    identity, so an operator sees an opaque key rather than a list of private repository URLs. It
 *    costs nothing and it is not recoverable later — a room id, once deployed, is a protocol.
 */

/** How a room id is written: a short prefix so it is recognisable in a relay's logs, then the digest. */
const ROOM_PREFIX = "vs";
/** Half a SHA-256 is far past collision concerns here and keeps the id readable. */
const ROOM_DIGEST_CHARS = 32;

/**
 * Reduce a git remote to the identity of the repository it points at, discarding everything that can
 * differ between two people who cloned the same thing: protocol, credentials, port, `.git` suffix,
 * trailing slash, and case in the host.
 */
export function normalizeRemote(remote: string): string {
  let value = remote.trim();
  if (!value) return "";

  // scp-style SSH — `git@github.com:owner/repo.git` — which is not a URL and will not parse as one.
  const scp = /^[^/@]+@([^:/]+):(.+)$/.exec(value);
  if (scp) {
    value = `${scp[1]}/${scp[2]}`;
  } else {
    value = value
      .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "") // scheme
      .replace(/^[^/@]*@/, ""); // credentials or user
  }

  value = value.replace(/\/+$/, "").replace(/\.git$/i, "");
  const slash = value.indexOf("/");
  if (slash === -1) return value.toLowerCase();
  // The host is case-insensitive; the path is not — `Owner/Repo` and `owner/repo` are different
  // repositories on a case-sensitive host, and treating them as one would merge two teams' sessions.
  const host = value.slice(0, slash).toLowerCase().replace(/:\d+$/, "");
  return `${host}/${value.slice(slash + 1)}`;
}

/**
 * The string a room id is derived from. Kept separate from the hashing so it can be asserted directly
 * in tests — the interesting failures are all in what goes IN to the digest.
 */
export function roomIdentity(remote: string, page: string): string | null {
  const repo = normalizeRemote(remote);
  if (!repo || !page) return null;
  return `${repo}#${page}`;
}

/** Format a digest as a room id. Split out so the async hashing lives at the call site. */
export function roomIdFromDigest(hex: string): string {
  return `${ROOM_PREFIX}-${hex.slice(0, ROOM_DIGEST_CHARS)}`;
}

/**
 * The room for a repository and page, hashed with the caller's digest function — `crypto.subtle` in
 * the renderer, `node:crypto` in a test. Null when the project has no remote or no page, which the
 * caller must treat as "no session", never as an error.
 */
export async function roomIdFor(
  remote: string,
  page: string,
  digest: (input: string) => Promise<string>,
): Promise<string | null> {
  const identity = roomIdentity(remote, page);
  if (identity === null) return null;
  return roomIdFromDigest(await digest(identity));
}

/** SHA-256 as lowercase hex, via the Web Crypto API available in the renderer. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
