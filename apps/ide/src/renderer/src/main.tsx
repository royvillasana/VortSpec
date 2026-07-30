import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles/globals.css";

// The Draw window loads the SAME renderer bundle with `?window=draw&project=…` (see main-process
// openDrawWindow) — render the Draw surface instead of the full IDE app for that window. DrawWindow is
// lazy so Excalidraw (heavy) is a SEPARATE chunk that only the Draw window loads, never the main IDE.
const params = new URLSearchParams(window.location.search);
const isDrawWindow = params.get("window") === "draw";
const drawProject = params.get("project") ?? "";

const DrawWindow = React.lazy(() => import("@vortspec/ui/DrawWindow").then((m) => ({ default: m.DrawWindow })));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isDrawWindow ? (
      <Suspense fallback={null}>
        <DrawWindow project={drawProject} />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
