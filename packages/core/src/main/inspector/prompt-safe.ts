/**
 * Neutralize an untrusted string before it is embedded in an agent prompt (Plan B
 * security hardening). Index/metadata content is DATA read from the user's project and
 * fed into runs launched with `--dangerously-skip-permissions`; without this a crafted
 * component name ("Button\n\n# SYSTEM: ...") injects instructions into the highest-trust
 * channel. Strip control chars + newlines (no new instruction line / forged delimiter),
 * strip `<>` (no delimiter break-out), collapse whitespace, and length-cap.
 */
export function safePromptField(s: string, max = 160): string {
  const cleaned = s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}
