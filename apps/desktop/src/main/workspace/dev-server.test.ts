import { describe, expect, it } from "vitest";
import { urlFrom } from "./dev-server";

describe("dev-server urlFrom", () => {
  it("parses the Vite Local line", () => {
    expect(urlFrom("  ➜  Local:   http://localhost:5173/")).toBe("http://localhost:5173/");
  });

  it("parses a Vite Local line with ANSI color codes inside the URL", () => {
    // Real vite output colorizes the port, dropping escape codes between `:` and
    // the digits — the exact shape that left the dev server stuck on "starting".
    const E = String.fromCharCode(27);
    const line = `  ${E}[32m➜${E}[39m  ${E}[1mLocal${E}[22m:   ${E}[36mhttp://localhost:${E}[1m5173${E}[22m/${E}[39m`;
    expect(urlFrom(line)).toBe("http://localhost:5173/");
  });

  it("parses a 127.0.0.1 URL and normalizes trailing slash", () => {
    expect(urlFrom("Server running at http://127.0.0.1:6006")).toBe("http://127.0.0.1:6006/");
  });

  it("rewrites 0.0.0.0 to localhost", () => {
    expect(urlFrom("listening on http://0.0.0.0:3000/")).toBe("http://localhost:3000/");
  });

  it("returns null when there is no local URL", () => {
    expect(urlFrom("compiling…")).toBeNull();
    expect(urlFrom("Network: https://example.com")).toBeNull();
  });
});
