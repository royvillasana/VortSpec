import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { LIGHT_PAGES_DIR } from "../../shared/light-page";
import { readProjectConfig } from "../workspace/config-manager";

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
/** Cached design-tokens CSS per project, injected so `var(--token)` references resolve in the canvas. */
const tokenCssCache = new Map<string, string>();

/** The light-pages directory served for a project (absolute). */
function pagesDir(projectPath: string): string {
  return join(projectPath, LIGHT_PAGES_DIR);
}

/** The project's design-tokens CSS (from `project.yaml` token_file), cached; "" when there is none. */
async function tokenCssFor(projectPath: string): Promise<string> {
  const cached = tokenCssCache.get(projectPath);
  if (cached !== undefined) return cached;
  let css = "";
  try {
    const config = await readProjectConfig(projectPath);
    if (config?.tokenFile) css = await readFile(join(projectPath, config.tokenFile), "utf8");
  } catch {
    /* no token file / unreadable → serve without injected tokens */
  }
  tokenCssCache.set(projectPath, css);
  return css;
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

/** Resolve a request path to a file INSIDE the pages dir, or null if it escapes / isn't an .html page. */
function resolvePageFile(dir: string, urlPath: string): string | null {
  const raw = decodeURIComponent((urlPath || "/").split("?")[0]).replace(/^\/+/, "");
  if (!raw) return null;
  const withExt = raw.endsWith(".html") ? raw : `${raw}.html`;
  const abs = resolve(dir, withExt);
  // Containment guard: the resolved file must live directly under the pages dir (no traversal).
  if (abs !== join(dir, withExt) || !abs.startsWith(dir + sep)) return null;
  return abs;
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
      const file = resolvePageFile(dir, req.url ?? "/");
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      try {
        const html = await readFile(file, "utf8");
        const withTokens = injectTokens(html, await tokenCssFor(projectPath));
        // no-store: the canvas always reflects the on-disk page (edits persist to it, then reload).
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(withTokens);
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
