import { mkdir, readFile, writeFile } from "node:fs/promises";
import { app } from "electron";
import { dirname, join } from "node:path";
import {
  collabConfigSchema,
  credentialFor,
  emptyCollabConfig,
  normalizeRelayUrl,
  relayCredentialsSchema,
  relayUrlProblem,
  COLLAB_CONFIG_PATH,
  RELAY_CREDENTIALS_FILE,
  type CollabConfig,
} from "@vortspec/core/collab-config";

/**
 * Reading and writing the two halves of the live session's configuration (change: live-playground,
 * task 2.3), which live in deliberately different places:
 *
 * - The relay's **address** in the project, committed, so cloning tells you where the team works.
 * - The **credential** in this machine's userData, never in the project, so cloning does not tell
 *   you how to get in.
 *
 * A write of the address is refused when it carries a secret. That refusal belongs here as much as
 * at the UI: a field that accepts a secret eventually has one in somebody's git history, and at that
 * point it is public and permanent, so the check lives on the path that actually writes the file.
 */

/** Best-effort: a project with no config, or a broken one, simply has no relay. */
export async function readCollabConfig(projectPath: string): Promise<CollabConfig> {
  try {
    return collabConfigSchema.parse(JSON.parse(await readFile(join(projectPath, COLLAB_CONFIG_PATH), "utf8")));
  } catch {
    return emptyCollabConfig;
  }
}

/**
 * Persist the project's relay address. Throws when the address would commit a secret — the caller
 * shows the message; nothing is written.
 */
export async function writeCollabConfig(projectPath: string, config: CollabConfig): Promise<CollabConfig> {
  const problem = relayUrlProblem(config.relayUrl);
  if (problem) throw new Error(problem);
  const parsed = collabConfigSchema.parse(config);
  const p = join(projectPath, COLLAB_CONFIG_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

const credentialsPath = (): string => join(app.getPath("userData"), RELAY_CREDENTIALS_FILE);

async function readCredentials(): Promise<Record<string, string>> {
  try {
    return relayCredentialsSchema.parse(JSON.parse(await readFile(credentialsPath(), "utf8")));
  } catch {
    return {};
  }
}

/**
 * Whether this machine holds a credential for a relay. Used to SHOW the state without reading the
 * secret — the settings UI needs to say "a credential is stored" and nothing more.
 *
 * To be clear about what the split does and does not protect: the boundary is the repository, not the
 * process. The renderer opens the WebSocket, so it does receive the secret (see `relayCredential`).
 * What it never does is put it somewhere that gets committed and pushed.
 */
export async function hasRelayCredential(relayUrl: string): Promise<boolean> {
  return credentialFor(await readCredentials(), relayUrl) !== "";
}

/** The credential for a relay, for the connection itself. Empty when this machine has none. */
export async function relayCredential(relayUrl: string): Promise<string> {
  return credentialFor(await readCredentials(), relayUrl);
}

/** Store or clear this machine's credential for a relay. An empty secret removes it. */
export async function setRelayCredential(relayUrl: string, secret: string): Promise<void> {
  const key = normalizeRelayUrl(relayUrl);
  if (!key) return;
  const credentials = await readCredentials();
  for (const stored of Object.keys(credentials)) {
    if (normalizeRelayUrl(stored) === key) delete credentials[stored];
  }
  if (secret.trim()) credentials[key] = secret.trim();
  const p = credentialsPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
}
