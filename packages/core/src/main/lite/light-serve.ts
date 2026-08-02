import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { LIGHT_PAGES_DIR } from "../../shared/light-page";
import { readProjectConfig } from "../workspace/config-manager";
import { materializeThemeCss } from "../inspector/theme-materialize";

/**
 * Static origin for light pages (OpenSpec change: light-pages-on-canvas, task 1). The framework
 * RunCanvas edits a page by loading it in a `<webview>` with the guest inspector-bridge preload — that
 * requires a real `http` origin (the bridge assumes same-origin DOM + navigation, which `srcdoc`/`file:`
 * break). So we serve `.vortspec/light-pages/<name>.html` from a tiny per-project localhost server and
 * point the webview at `…/<name>.html`; the same guest preload instruments it exactly like a dev-server
 * page. One server per project, reused; bound to 127.0.0.1 on an ephemeral port.
 */

interface LiteServer {
  server: http.Server;
  port: number;
}

const servers = new Map<string, LiteServer>();
/** Cached BASE design-tokens CSS per project (the token_file read); the overlay is layered fresh. */
const baseTokenCssCache = new Map<string, string>();

/** The light-pages directory served for a project (absolute). */
function pagesDir(projectPath: string): string {
  return join(projectPath, LIGHT_PAGES_DIR);
}

/** The project's BASE design-tokens CSS (from `project.yaml` token_file), cached; "" when there is none. */
async function baseTokenCssFor(projectPath: string): Promise<string> {
  const cached = baseTokenCssCache.get(projectPath);
  if (cached !== undefined) return cached;
  let css = "";
  try {
    const config = await readProjectConfig(projectPath);
    if (config?.tokenFile) css = await readFile(join(projectPath, config.tokenFile), "utf8");
  } catch {
    /* no token file / unreadable → serve without injected tokens */
  }
  baseTokenCssCache.set(projectPath, css);
  return css;
}

/**
 * The tokens CSS injected into a served page: the cached base token_file PLUS the durable personalization
 * overlay (change: consume-component-libraries, task 12.3/12.5) materialized fresh on every request so a
 * token edit — including an enterprise/consumed edit that never touches the real source — shows on the
 * canvas immediately, without invalidating the (large, rarely-changing) base read. Overlay is appended
 * AFTER the base so it wins by cascade.
 */
async function tokenCssFor(projectPath: string): Promise<string> {
  const base = await baseTokenCssFor(projectPath);
  const overlay = await materializeThemeCss(projectPath).catch(() => "");
  return overlay ? `${base}\n${overlay}` : base;
}

/**
 * Drop the cached BASE token CSS for a project so the next served page re-reads token_file. Called after a
 * token edit that mutates the file in place (owned CSS/SCSS/JSON/TS sources). Overlay-only edits don't need
 * this — the overlay is already read fresh per request.
 */
export function clearTokenCssCache(projectPath: string): void {
  baseTokenCssCache.delete(projectPath);
}

/**
 * Inject the design-tokens CSS so `var(--token)` styles (e.g. a margin token applied in the DesignPanel)
 * RESOLVE in the served page — a light page authored from stand-ins doesn't carry the token variables.
 * Marked `data-vs-style` so the guest's `serializeDom` strips it — the tokens are never saved into the page.
 */
function injectTokens(html: string, css: string): string {
  if (!css.trim()) return html;
  const tag = `<style data-vs-style="vs-tokens">\n${css}\n</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
  return tag + html;
}

/** Content-type by extension — HTML pages plus the assets a page references (video/image/font/…). */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

/**
 * SAFETY NET against a page that hard-freezes the app. An AI (or a paste) can inline a megabyte of video
 * or image as a base64 `data:` URI; the webview then chokes decoding/painting it while the inspector
 * serializes the huge DOM. Any base64 payload larger than this cap is swapped for a 1×1 placeholder in the
 * PREVIEW ONLY — the on-disk file is never touched — so the canvas always stays responsive. Legit media
 * belongs in `assets/` and is referenced by path (served above), which never inflates the HTML.
 */
const MAX_INLINE_DATA_URI = 200_000; // base64 chars ≈ 150KB decoded
const TINY_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** Swap any oversized inline base64 `data:` payload for a 1×1 placeholder. Returns the count swapped. */
function neutralizeHugeInlineData(html: string): { html: string; stripped: number } {
  let stripped = 0;
  const out = html.replace(/data:[a-z0-9.+/-]*;base64,([A-Za-z0-9+/=]+)/gi, (m: string, payload: string) => {
    if (payload.length > MAX_INLINE_DATA_URI) {
      stripped++;
      return TINY_PLACEHOLDER;
    }
    return m;
  });
  return { html: out, stripped };
}

/**
 * A preview-only notice (a `data-vs-style` <style>, so `serializeDom` strips it — never saved) telling the
 * user WHY their inline media is blank: it was too large to inline and belongs in `assets/`.
 */
function inlineMediaNotice(count: number): string {
  const msg =
    `${count} oversized inline media item${count === 1 ? "" : "s"} skipped in preview — save media under ` +
    `.vortspec/light-pages/assets/ and reference it by path (assets/…), don't inline it.`;
  return `<style data-vs-style="vs-notice">body::before{content:${JSON.stringify("⚠ " + msg)};position:fixed;left:0;right:0;bottom:0;z-index:2147483647;margin:0;padding:8px 14px;font:12px/1.4 system-ui,-apple-system,sans-serif;color:#fff;background:rgba(176,42,55,.95);text-align:center;pointer-events:none}</style>`;
}

/**
 * Resolve a request path to a file INSIDE the pages dir, or null if it escapes (traversal). A path with
 * no extension is treated as a page (`<name>.html`); any other extension is served verbatim as an asset
 * a page references (e.g. `assets/hero.mp4`) — so a hero video/image loads from a real file instead of a
 * megabyte of inline base64. Subdirectories (an `assets/` folder) are allowed; `..` traversal is not.
 */
function resolveFile(dir: string, urlPath: string): string | null {
  const raw = decodeURIComponent((urlPath || "/").split("?")[0]).replace(/^\/+/, "");
  if (!raw) return null;
  const rel = extname(raw) ? raw : `${raw}.html`;
  const abs = resolve(dir, rel);
  // Containment guard: the resolved file must live under the pages dir (allows subdirs; blocks `..`).
  if (abs !== join(dir, rel) || !abs.startsWith(dir + sep)) return null;
  return abs;
}

/**
 * Serve a static asset (video/image/font/…) with HTTP Range support — video playback in the canvas
 * <webview> issues Range requests and needs a 206 for seeking, so a full-body 200 alone breaks scrubbing.
 */
async function serveAsset(res: http.ServerResponse, file: string, ext: string, range?: string): Promise<void> {
  const { size } = await stat(file);
  const type = MIME[ext] ?? "application/octet-stream";
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
      // Unsatisfiable range → 416 with the valid extent, per HTTP spec.
      res.writeHead(416, { "content-range": `bytes */${size}`, "accept-ranges": "bytes" });
      res.end();
      return;
    }
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    res.writeHead(206, {
      "content-type": type,
      "content-range": `bytes ${start}-${end}/${size}`,
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
      "cache-control": "no-store",
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}

/**
 * Ensure a static server is running for this project's light pages and return its base URL
 * (`http://127.0.0.1:<port>/`). Idempotent — the same project reuses its server.
 */
export async function serveLightPages(projectPath: string): Promise<string> {
  const existing = servers.get(projectPath);
  if (existing) return `http://127.0.0.1:${existing.port}/`;

  const dir = pagesDir(projectPath);
  const server = http.createServer((req, res) => {
    void (async () => {
      const file = resolveFile(dir, req.url ?? "/");
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      const ext = extname(file).toLowerCase();
      try {
        if (ext === ".html") {
          const raw = await readFile(file, "utf8");
          // Safety net FIRST: neutralize any app-freezing oversized inline media before it reaches the webview.
          const safe = neutralizeHugeInlineData(raw);
          let out = injectTokens(safe.html, await tokenCssFor(projectPath));
          if (safe.stripped > 0) {
            const notice = inlineMediaNotice(safe.stripped);
            out = out.includes("</body>") ? out.replace(/<\/body>/i, `${notice}</body>`) : out + notice;
          }
          // no-store: the canvas always reflects the on-disk page (edits persist to it, then reload).
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          res.end(out);
          return;
        }
        // A page-referenced asset (video/image/font/…): stream it with Range support so video seeks.
        await serveAsset(res, file, ext, req.headers.range);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      }
    })();
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  servers.set(projectPath, { server, port });
  return `http://127.0.0.1:${port}/`;
}

/** The served URL for one light page (given the base URL from {@link serveLightPages}). */
export function lightPageUrl(baseUrl: string, name: string): string {
  const clean = name.replace(/[/\\]/g, "-").replace(/\.html$/i, "");
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(clean)}.html`;
}

/** Stop and drop a project's light-pages server (e.g. when the project closes). */
export function stopLightServe(projectPath: string): void {
  const s = servers.get(projectPath);
  if (!s) return;
  s.server.close();
  servers.delete(projectPath);
}
