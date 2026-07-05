/**
 * Parse a Figma URL and extract the file key.
 *
 * Matches URLs of the form:
 *   - https://www.figma.com/design/:key/...
 *   - https://www.figma.com/file/:key/...
 *   - https://figma.com/design/:key/...
 *   - https://figma.com/file/:key/...
 */
export function parseFigmaUrl(
  url: string,
): { fileKey: string } | null {
  const match = url.match(/figma\.com\/(design|file)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  return { fileKey: match[2] };
}
