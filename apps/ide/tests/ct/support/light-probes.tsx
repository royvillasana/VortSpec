import React, { useEffect, useState } from "react";
import { docToLightHtml, lightHtmlToDoc } from "@vortspec/core/light-doc";
import { adoptLightPage } from "@vortspec/ui/light-dom-bind";

/**
 * Probes for the live-document CT tests (change: live-playground, task 1.5).
 *
 * They live here rather than in the test file because Playwright CT can only mount components from
 * a separate module — a component defined in the test file fails with "cannot be mounted". The React
 * import is likewise required even with the automatic JSX runtime: a support file without it renders
 * nothing, and the failure surfaces as a selector error rather than as itself.
 */

/**
 * Runs the adoption path against a document Chromium parsed, and renders the verdict. Doing the work
 * inside a mounted component is what puts it in the browser rather than in Node.
 */
export function AdoptionProbe({ html }: { html: string }): React.ReactElement {
  const [verdict, setVerdict] = useState("running");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    const doc = lightHtmlToDoc(html);
    if (!doc) {
      setVerdict("cannot-model");
      return;
    }
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const binding = adoptLightPage(doc, parsed);
    if (!binding) {
      setVerdict("refused");
      return;
    }
    const out = docToLightHtml(doc);
    if (out === html) {
      setVerdict("adopted-identical");
      return;
    }
    setVerdict("adopted-but-differs");
    let i = 0;
    while (i < out.length && i < html.length && out[i] === html[i]) i += 1;
    setDetail(`diverges at ${i}: expected ${JSON.stringify(html.slice(i, i + 80))}`);
  }, [html]);

  return (
    <div>
      <span data-testid="verdict">{verdict}</span>
      <span data-testid="detail">{detail}</span>
    </div>
  );
}

/** An edit through the document, in the engine that will actually be making them. */
export function EditProbe({ html }: { html: string }): React.ReactElement {
  const [result, setResult] = useState("running");

  useEffect(() => {
    const doc = lightHtmlToDoc(html);
    if (!doc) {
      setResult("cannot-model");
      return;
    }
    const parsed = new DOMParser().parseFromString(html, "text/html");
    if (!adoptLightPage(doc, parsed)) {
      setResult("refused");
      return;
    }
    const target = parsed.body.querySelector("*");
    if (!target) {
      setResult("no-element");
      return;
    }
    target.setAttribute("data-probe", "1");
    // The mutation observer delivers on a microtask; give it one before reading back.
    setTimeout(() => {
      const out = docToLightHtml(doc);
      const changedLines = out.split("\n").filter((line, i) => line !== html.split("\n")[i]).length;
      setResult(`${out.includes('data-probe="1"') ? "carried" : "lost"}:${changedLines}`);
    }, 0);
  }, [html]);

  // Wrapped rather than returned bare: Playwright's component locator searches the mounted root's
  // DESCENDANTS, so a testid on the root element itself is invisible to `component.getByTestId`.
  return (
    <div>
      <span data-testid="result">{result}</span>
    </div>
  );
}

