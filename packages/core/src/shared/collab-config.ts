/**
 * Where a live session's relay is configured (OpenSpec change: live-playground, task 2.3).
 *
 * The split is deliberate and is the whole content of this module:
 *
 * - **The relay's address is a team fact**, so it lives in the project at `.vortspec/collab.json` and
 *   is committed. Cloning the repository tells you where the team collaborates.
 * - **The credential is a person's**, so it lives in the user's own data directory and never enters
 *   the repository. Cloning tells you the address, not how to get in.
 *
 * Which is why `relayUrl` is REFUSED when it carries a credential — `wss://user:pass@host` or a
 * `?token=` — rather than accepted and stripped. A field that silently accepts a secret is a field
 * that eventually holds one in someone's git history, and by then it is public and permanent.
 * Refusing at the boundary is the only version of this that stays true.
 *
 * Credentials are keyed by relay rather than by project: a team pointing five projects at one relay
 * has one secret, and rotating it is one edit instead of five.
 */
import { z } from "zod";

/** Project-relative path of the committed collaboration config. */
export const COLLAB_CONFIG_PATH = ".vortspec/collab.json";

/** Per-user credential store, resolved against the app's userData directory. */
export const RELAY_CREDENTIALS_FILE = "relay-credentials.json";

export const collabConfigSchema = z.object({
  /**
   * The team's relay, e.g. `wss://relay.acme.dev`. Empty or absent means this project has no live
   * session — the Playground behaves exactly as it does without the feature, connecting to nothing.
   */
  relayUrl: z.string().default(""),
});
export type CollabConfig = z.infer<typeof collabConfigSchema>;

export const emptyCollabConfig: CollabConfig = { relayUrl: "" };

/** Why a relay URL was refused — worded to be shown to the user, not logged and swallowed. */
export type RelayUrlProblem =
  | "not-websocket"
  | "has-credentials"
  | "has-query-secret"
  | "unparseable";

export const relayUrlProblemMessage: Record<RelayUrlProblem, string> = {
  "not-websocket": "A relay address must start with ws:// or wss://.",
  "has-credentials":
    "That address contains a username or password. It would be committed to the repository — put the secret in this machine's credentials instead.",
  "has-query-secret":
    "That address contains a token in its query string. It would be committed to the repository — put the secret in this machine's credentials instead.",
  unparseable: "That is not a valid address.",
};

/** Query parameters that carry a secret often enough to be worth refusing by name. */
const SECRET_PARAMS = ["token", "secret", "key", "access_token", "apikey", "api_key", "password"];

/**
 * Validate a relay address for storage in the project. Returns null when it is safe to commit.
 *
 * This is not a general URL validator: its single job is to make it impossible to put a secret
 * somewhere that gets pushed.
 */
export function relayUrlProblem(url: string): RelayUrlProblem | null {
  const value = url.trim();
  if (!value) return null; // no relay configured is a valid, supported state
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "unparseable";
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return "not-websocket";
  if (parsed.username || parsed.password) return "has-credentials";
  for (const [name] of parsed.searchParams) {
    if (SECRET_PARAMS.includes(name.toLowerCase())) return "has-query-secret";
  }
  return null;
}

/** Whether this project has a relay to connect to at all. */
export function hasRelay(config: CollabConfig | null): boolean {
  return !!config && config.relayUrl.trim() !== "" && relayUrlProblem(config.relayUrl) === null;
}

/**
 * Credentials this machine holds, keyed by relay address. Never written to the project, never sent
 * anywhere but the relay it belongs to.
 */
export const relayCredentialsSchema = z.record(z.string(), z.string()).default({});
export type RelayCredentials = z.infer<typeof relayCredentialsSchema>;

/**
 * The credential for a relay, or "" when this machine has none — which is a normal state, not an
 * error: a relay may be open, or the user may not have been given the secret yet.
 *
 * Lookup is by normalized address so that a trailing slash or a capitalised host does not hide a
 * credential the user has already entered and produce an unexplainable rejection.
 */
export function credentialFor(credentials: RelayCredentials, relayUrl: string): string {
  const key = normalizeRelayUrl(relayUrl);
  if (!key) return "";
  for (const [stored, secret] of Object.entries(credentials)) {
    if (normalizeRelayUrl(stored) === key) return secret;
  }
  return "";
}

/** A relay address reduced to what identifies the server: scheme, host, port, path. */
export function normalizeRelayUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}`;
  } catch {
    return value.toLowerCase().replace(/\/+$/, "");
  }
}
