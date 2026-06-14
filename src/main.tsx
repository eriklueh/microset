import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { FloatingPanel } from "./components/panel/FloatingPanel";
import { Toast } from "./components/toast/Toast";
import { setupCrossWindowSync } from "./store/sync";
import { setupFileSync } from "./store/files";
import { useStore } from "./store/useStore";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import "./index.css";

// Both windows load this same bundle; the window label decides which view to render.
setupCrossWindowSync();

const label = getCurrentWindow().label;
const isPanel = label === "panel";
const isToast = label === "toast";
document.documentElement.classList.add(
  isPanel ? "win-panel" : isToast ? "win-toast" : "win-main",
);

// Apply persisted theme before first paint and keep it in sync with the OS.
const { mode, accent } = useStore.getState().theme;
applyTheme(mode, accent);
watchSystemTheme(
  () => useStore.getState().theme.mode,
  () => useStore.getState().theme.accent,
);

// Only the main window owns the file-backed config (load/save/watch).
if (!isPanel && !isToast) void setupFileSync();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPanel ? <FloatingPanel /> : isToast ? <Toast /> : <App />}
  </React.StrictMode>,
);
