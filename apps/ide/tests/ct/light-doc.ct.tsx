import React, { useEffect, useState } from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { AdoptionProbe, EditProbe } from "./support/light-probes";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Read in Node and passed to the component as a prop: the test file runs in Node while only the
// component is bundled for the browser, so a `?raw` import here is never transformed.
// `__dirname` does not exist in this ES module scope — the same trap that shipped v0.1.35 unable to
// open a window — so it is derived.
const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(resolve(here, "../../../../packages/core/src/shared/__fixtures__/light-pages", name), "utf8");

const shopdev = fixture("shopdev.html");

/**
 * The live document, in a real browser engine (change: live-playground, task 1.5).
 *
 * The unit tests for this run under happy-dom, and happy-dom is not Chromium. The entire adoption
 * design turns on what a browser's HTML parser does to a page — whether it inserts nodes nobody
 * wrote, moves misplaced ones, or normalises anything — so a green suite under a different parser
 * proves less than it appears to. These tests answer the same questions against the engine the
 * Playground actually runs in, so that "the page adopts and round-trips exactly" stops being a claim
 * that needs a person to check by hand.
 */

const PAGES: Array<[string, string]> = [
  ["bank-of-america-landing", fixture("bank-of-america-landing.html")],
  ["Animated-carousel-card", fixture("Animated-carousel-card.html")],
  ["shopdev", shopdev],
  ["CorteIngles", fixture("CorteIngles.html")],
];

for (const [name, html] of PAGES) {
  test(`${name} adopts in Chromium and round-trips byte for byte`, async ({ mount }) => {
    const component = await mount(<AdoptionProbe html={html} />);
    await expect(component.getByTestId("verdict")).not.toHaveText("running");
    // The detail is asserted first: when this fails, the divergence is what you need to see, and a
    // bare "expected adopted-identical, got adopted-but-differs" tells you nothing about where.
    await expect(component.getByTestId("detail")).toHaveText("");
    await expect(component.getByTestId("verdict")).toHaveText("adopted-identical");
  });
}

test("an edit reaches the document and rewrites only the line it touched", async ({ mount }) => {
  const component = await mount(<EditProbe html={shopdev} />);
  // "carried:1" — the edit is in the document, and exactly one line of the file differs. That second
  // number is the reviewable-diff claim: a whole-file reformat would show up here as hundreds.
  await expect(component.getByTestId("result")).toHaveText("carried:1");
});
