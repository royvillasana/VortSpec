import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveLightPages, lightPageUrl, stopLightServe } from "./light-serve";
import { LIGHT_PAGES_DIR } from "../../shared/light-page";

describe("light-serve", () => {
  it("serves a light page, 404s on missing, and blocks path traversal", async () => {
    const proj = await mkdtemp(join(tmpdir(), "lp-serve-"));
    await mkdir(join(proj, LIGHT_PAGES_DIR), { recursive: true });
    await writeFile(join(proj, LIGHT_PAGES_DIR, "Home.html"), "<!doctype html><h1>hi</h1>", "utf8");
    const base = await serveLightPages(proj);
    try {
      const ok = await fetch(lightPageUrl(base, "Home"));
      expect(ok.status).toBe(200);
      expect(await ok.text()).toContain("<h1>hi</h1>");

      expect((await fetch(`${base}Nope.html`)).status).toBe(404);

      // Encoded traversal must NOT escape the pages dir.
      const trav = await fetch(`${base}..%2f..%2f..%2f..%2fetc%2fpasswd`);
      expect(trav.status).toBe(404);
    } finally {
      stopLightServe(proj);
      await rm(proj, { recursive: true, force: true });
    }
  });

  it("reuses one server per project (same base URL)", async () => {
    const proj = await mkdtemp(join(tmpdir(), "lp-serve2-"));
    await mkdir(join(proj, LIGHT_PAGES_DIR), { recursive: true });
    try {
      const a = await serveLightPages(proj);
      const b = await serveLightPages(proj);
      expect(a).toBe(b);
    } finally {
      stopLightServe(proj);
      await rm(proj, { recursive: true, force: true });
    }
  });

  it("injects the project's design-tokens CSS so var(--token) resolves in the served page", async () => {
    const proj = await mkdtemp(join(tmpdir(), "lp-serve-tok-"));
    await mkdir(join(proj, LIGHT_PAGES_DIR), { recursive: true });
    await mkdir(join(proj, ".sdd-de"), { recursive: true });
    await writeFile(join(proj, ".sdd-de", "project.yaml"), "token_file: tokens.css\n", "utf8");
    await writeFile(join(proj, "tokens.css"), ":root{--space-4:16px}", "utf8");
    await writeFile(join(proj, LIGHT_PAGES_DIR, "P.html"), "<!doctype html><html><head></head><body><div>x</div></body></html>", "utf8");
    const base = await serveLightPages(proj);
    try {
      const html = await (await fetch(lightPageUrl(base, "P"))).text();
      expect(html).toContain("--space-4:16px");
      expect(html).toContain('data-vs-style="vs-tokens"'); // marked so serializeDom strips it (never saved)
    } finally {
      stopLightServe(proj);
      await rm(proj, { recursive: true, force: true });
    }
  });

  it("lightPageUrl sanitizes the name and appends .html once", () => {
    expect(lightPageUrl("http://127.0.0.1:1/", "Airbnb Landing")).toBe("http://127.0.0.1:1/Airbnb%20Landing.html");
    expect(lightPageUrl("http://127.0.0.1:1/", "a/b")).toBe("http://127.0.0.1:1/a-b.html");
    expect(lightPageUrl("http://127.0.0.1:1/", "Home.html")).toBe("http://127.0.0.1:1/Home.html");
  });
});
