import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { FloatingPanel } from "./components/panel/FloatingPanel";
import { setupCrossWindowSync } from "./store/sync";
import "./index.css";

// Both windows load this same bundle; the window label decides which view to render.
setupCrossWindowSync();
const isPanel = getCurrentWindow().label === "panel";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isPanel ? <FloatingPanel /> : <App />}</React.StrictMode>,
);
