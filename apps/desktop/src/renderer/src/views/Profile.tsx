import { useEffect, useRef, useState } from "react";
import type { Profile as ProfileT, ProfilePreferences, UsageResult } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { Button, Card, Spinner } from "@vortspec/ui/ui";

/**
 * The global Profile page (top-right avatar → here). Three sections:
 *  - Usage: Claude's own /usage percentage bars, mirrored so the user sees their
 *    limits without leaving the app (read via the user's own Claude, $0, no proxy).
 *  - Identity: display name + optional avatar image, used to address the user by
 *    name when they talk to the AI.
 *  - Preferences: default intake answers that pre-fill the setup wizard.
 */

const FRAMEWORKS = ["react", "next", "vue", "nuxt", "svelte", "sveltekit", "angular", "astro", "vanilla"];
const LANGUAGES = ["typescript", "javascript"];
const STYLINGS = ["tailwind", "css-modules", "scss", "styled-components", "emotion", "css"];
const TEST_RUNNERS = ["vitest", "jest", "playwright", "cypress", "none"];

/** Color the bar by how close to the limit the user is. */
function barTone(percent: number): string {
  if (percent >= 90) return "bg-vs-error";
  if (percent >= 70) return "bg-vs-warning";
  return "bg-vs-accent";
}

export function Profile({ onBack, onSaved }: { onBack: () => void; onSaved?: (p: ProfileT) => void }): React.JSX.Element {
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.getProfile().then(setProfile);
    void refreshUsage();
  }, []);

  async function refreshUsage(): Promise<void> {
    setUsageLoading(true);
    setUsage(await api.getUsage());
    setUsageLoading(false);
  }

  function edit(patch: Partial<ProfileT>): void {
    setProfile((p) => (p ? { ...p, ...patch } : p));
    setSaved(false);
  }
  function editPref(patch: Partial<ProfilePreferences>): void {
    setProfile((p) => (p ? { ...p, preferences: { ...p.preferences, ...patch } } : p));
    setSaved(false);
  }

  async function save(): Promise<void> {
    if (!profile) return;
    const next = await api.saveProfile(profile);
    setProfile(next);
    setSaved(true);
    onSaved?.(next);
  }

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => edit({ avatarDataUrl: typeof reader.result === "string" ? reader.result : null });
    reader.readAsDataURL(file);
  }

  const initial = (profile?.name.trim()?.[0] ?? "").toUpperCase() || "?";

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-vs-bg-primary text-vs-text-primary">
      <header className="flex flex-none items-center gap-3 border-b border-vs-border-default px-8 py-5">
        <button onClick={onBack} className="text-sm text-vs-text-secondary hover:text-vs-text-primary">
          ← Back
        </button>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Profile</h1>
      </header>

      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-8 py-8">
        {/* ── Usage ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">Plan usage</h2>
            <div className="flex-1" />
            <button
              onClick={() => void refreshUsage()}
              disabled={usageLoading}
              className="text-xs text-vs-text-secondary hover:text-vs-text-primary disabled:opacity-50"
            >
              {usageLoading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          <Card className="flex flex-col gap-4 p-5">
            {usageLoading && !usage ? (
              <div className="flex items-center gap-2 text-sm text-vs-text-secondary">
                <Spinner /> Reading your usage from Claude Code…
              </div>
            ) : usage?.available ? (
              <>
                {usage.headline && <p className="text-xs text-vs-text-secondary">{usage.headline}</p>}
                <div className="flex flex-col gap-4">
                  {usage.limits.map((l) => (
                    <div key={l.label} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-vs-text-primary">{l.label}</span>
                        <span className="tabular-nums font-medium">{l.percent}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-vs-border-default">
                        <div
                          className={`h-full rounded-full ${barTone(l.percent)} transition-[width] duration-500`}
                          style={{ width: `${Math.min(Math.max(l.percent, 0), 100)}%` }}
                        />
                      </div>
                      {l.resetsAt && <span className="text-[11px] text-vs-text-muted">resets {l.resetsAt}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <button onClick={() => setShowRaw((v) => !v)} className="text-vs-text-secondary hover:text-vs-text-primary">
                    {showRaw ? "Hide details" : "What's contributing?"}
                  </button>
                  <span className="text-vs-text-muted">
                    Your account's plan limits, mirrored from Claude Code's{" "}
                    <code className="text-vs-text-secondary">/usage</code>
                  </span>
                </div>
                {showRaw && (
                  <div className="flex flex-col gap-2">
                    {usage.note && (
                      <p className="text-[11px] text-vs-text-muted">
                        The breakdown below is a local estimate: {usage.note}
                      </p>
                    )}
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-vs-border-default bg-vs-bg-code p-3 font-mono text-[11px] leading-relaxed text-vs-text-secondary">
                      {usage.raw}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <span className="text-vs-warning">⚠ {usage?.error ?? "Usage is unavailable."}</span>
                <span className="text-xs text-vs-text-muted">
                  Usage comes from your own Claude Code (<code>claude -p /usage</code>). Make sure it's installed and
                  logged in, then Refresh.
                </span>
              </div>
            )}
          </Card>
        </section>

        {/* ── Identity ──────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">Your profile</h2>
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                {profile?.avatarDataUrl ? (
                  <img
                    src={profile.avatarDataUrl}
                    alt="avatar"
                    className="h-16 w-16 rounded-full border border-vs-border-strong object-cover"
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-full border border-vs-border-strong bg-vs-bg-elevated text-xl font-medium text-vs-text-secondary">
                    {initial}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} className="hidden" />
                <div className="flex gap-2">
                  <Button variant="default" onClick={() => fileRef.current?.click()}>
                    {profile?.avatarDataUrl ? "Change image" : "Upload image"}
                  </Button>
                  {profile?.avatarDataUrl && (
                    <Button variant="ghost" onClick={() => edit({ avatarDataUrl: null })}>
                      Remove
                    </Button>
                  )}
                </div>
                <span className="text-[11px] text-vs-text-muted">Optional. Stored locally on this machine.</span>
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-vs-text-secondary">Name</span>
              <input
                value={profile?.name ?? ""}
                onChange={(e) => edit({ name: e.target.value })}
                placeholder="How should we call you?"
                className="rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
              />
              <span className="text-[11px] text-vs-text-muted">
                We'll use this to address you when you chat with the assistant.
              </span>
            </label>
          </Card>
        </section>

        {/* ── Preferences (intake defaults) ─────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Default project preferences
          </h2>
          <Card className="grid grid-cols-2 gap-4 p-5">
            <PrefSelect label="Framework" value={profile?.preferences.framework} options={FRAMEWORKS} onChange={(v) => editPref({ framework: v })} />
            <PrefSelect label="Language" value={profile?.preferences.language} options={LANGUAGES} onChange={(v) => editPref({ language: v })} />
            <PrefSelect label="Styling" value={profile?.preferences.styling} options={STYLINGS} onChange={(v) => editPref({ styling: v })} />
            <PrefSelect label="Test runner" value={profile?.preferences.testRunner} options={TEST_RUNNERS} onChange={(v) => editPref({ testRunner: v })} />
            <label className="col-span-2 flex flex-col gap-1.5">
              <span className="text-xs text-vs-text-secondary">Figma token collection (default)</span>
              <input
                value={profile?.preferences.figmaTokenCollection ?? ""}
                onChange={(e) => editPref({ figmaTokenCollection: e.target.value })}
                placeholder="e.g. Primitives"
                className="rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
              />
            </label>
            <span className="col-span-2 text-[11px] text-vs-text-muted">
              These pre-fill the setup wizard when you create a new project. Each project keeps its own config.
            </span>
          </Card>
        </section>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => void save()}>
            Save profile
          </Button>
          {saved && <span className="text-xs text-vs-success">✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

function PrefSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-vs-text-secondary">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
      >
        <option value="">No default</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
