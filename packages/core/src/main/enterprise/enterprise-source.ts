/**
 * Main-process wiring for Connect Enterprise Design System (change: connect-enterprise-design-system).
 * Resolves the client's Storybook to an embeddable URL (a hosted/dev URL used as-is, or a served static
 * `storybook-static/` build), fetches its story catalog, and builds the snapshot / generate prompts from
 * the connected assets. The pure builders live in `@vortspec/core/enterprise-consume`.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, isAbsolute } from "node:path";
import { readProjectConfig } from "../workspace/config-manager";
import { listLightPages } from "../lite/lite-source";
import { parseStorybookIndex, type StoryCatalog } from "../../shared/storybook-catalog";
import {
  buildEnterpriseSnapshotPrompt,
  buildEnterpriseGeneratePrompt,
} from "../../shared/enterprise-consume";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const staticServers = new Map<string, { server: http.Server; port: number }>();

/** Serve a local directory (a Storybook static build) over 127.0.0.1, one server per dir, path-guarded. */
async function serveStaticDir(dir: string): Promise<string> {
  const existing = staticServers.get(dir);
  if (existing) return `http://127.0.0.1:${existing.port}/`;
  const root = normalize(dir);
  const server = http.createServer((req, res) => {
    void (async () => {
      let rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (rel.endsWith("/")) rel += "index.html";
      const full = normalize(join(root, rel));
      if (!full.startsWith(root)) {
        res.writeHead(403).end("forbidden"); // path traversal guard
        return;
      }
      try {
        const body = await readFile(full);
        res.writeHead(200, { "content-type": CONTENT_TYPES[extname(full)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
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
  staticServers.set(dir, { server, port });
  return `http://127.0.0.1:${port}/`;
}

/**
 * Resolve the client's Storybook to an embeddable base URL. `url` → used as-is; `static` → the
 * `storybook_source` dir served locally; `repo` → null (needs a build first). Null when not enterprise.
 */
export async function resolveEnterpriseStorybookUrl(projectPath: string): Promise<string | null> {
  const cfg = await readProjectConfig(projectPath);
  if (cfg?.designSource !== "enterprise" || !cfg.storybookSource) return null;
  const kind = cfg.storybookSourceKind ?? "url";
  if (kind === "url") return cfg.storybookSource.replace(/\/+$/, "") + "/";
  if (kind === "static") {
    const dir = isAbsolute(cfg.storybookSource) ? cfg.storybookSource : join(projectPath, cfg.storybookSource);
    try {
      if ((await stat(dir)).isDirectory()) return serveStaticDir(dir);
    } catch {
      /* missing dir */
    }
    return null;
  }
  return null; // repo: build-from-repo produces a static dir first (convenience, separate)
}

/** Fetch + parse the Storybook story catalog from its index (`index.json` v7/8, else `stories.json` v6). */
export async function fetchStoryCatalog(baseUrl: string): Promise<StoryCatalog> {
  const base = baseUrl.replace(/\/+$/, "");
  for (const name of ["index.json", "stories.json"]) {
    try {
      const r = await fetch(`${base}/${name}`);
      if (r.ok) return parseStorybookIndex(await r.json());
    } catch {
      /* try the next */
    }
  }
  return [];
}

/**
 * Build the enterprise SNAPSHOT prompt for a project: resolve the client's Storybook, read its catalog,
 * and map each component to its first story render. "" when the Storybook can't be resolved/read.
 */
export async function buildEnterpriseSnapshotPromptFor(projectPath: string): Promise<string> {
  const base = await resolveEnterpriseStorybookUrl(projectPath);
  if (!base) return "";
  const catalog = await fetchStoryCatalog(base);
  if (catalog.length === 0) return "";
  const components = catalog.map((c) => ({ name: c.component, storyId: c.stories[0]?.id }));
  return buildEnterpriseSnapshotPrompt(components, base);
}

/** Build the enterprise "Generate code" prompt for all of a project's composed screens. "" when none. */
export async function buildEnterpriseGeneratePromptFor(projectPath: string): Promise<string> {
  const names = await listLightPages(projectPath);
  return names.length ? buildEnterpriseGeneratePrompt(names) : "";
}
