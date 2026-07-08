import { app } from "electron";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { Profile } from "@vortspec/core/profile";
import { profileSchema, EMPTY_PROFILE } from "@vortspec/core/profile";

/**
 * The global (per-user) profile — the app's only app-wide settings store,
 * persisted as plain JSON in userData. Mirrors workspace-manager's shape:
 * read-with-default, mkdir + write. No credentials or telemetry, identity and
 * intake defaults only.
 */

function profilePath(): string {
  return join(app.getPath("userData"), "profile.json");
}

export async function readProfile(): Promise<Profile> {
  try {
    const raw = await readFile(profilePath(), "utf8");
    const parsed = profileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_PROFILE;
  } catch {
    return EMPTY_PROFILE;
  }
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  // Validate + normalize at the boundary before persisting.
  const next = profileSchema.parse(profile);
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(profilePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
