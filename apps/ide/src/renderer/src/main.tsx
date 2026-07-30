import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DrawWindow } from "@vortspec/ui/DrawWindow";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles/globals.css";

// The Draw window loads the SAME renderer bundle with `?window=draw&project=…` (see main-process
// openDrawWindow) — render the Draw surface instead of the full IDE app for that window.
const params = new URLSearchParams(window.location.search);
const isDrawWindow = params.get("window") === "draw";
const drawProject = params.get("project") ?? "";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isDrawWindow ? <DrawWindow project={drawProject} /> : <App />}
  </React.StrictMode>,
);
