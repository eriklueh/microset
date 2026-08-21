import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
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

// Optional social/cloud layer (F4). Guarded by env: if either key is missing the app
// renders bare — LOCAL-FIRST stays intact, no providers, no network. Panel/toast never
// touch Clerk/Convex regardless.
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

const label = getCurrentWindow().label;
const isPanel = label === "panel";
const isToast = label === "toast";
document.documentElement.classList.add(
  isPanel ? "win-panel" : isToast ? "win-toast" : "win-main",
);

// Apply persisted theme before first paint and keep it in sync with the OS.
const { mode, accent } = useStore.getState().theme;
applyTheme(mode, accent);
document.documentElement.lang = useStore.getState().lang;
watchSystemTheme(
  () => useStore.getState().theme.mode,
  () => useStore.getState().theme.accent,
);

// Only the main window owns the file-backed config (load/save/watch).
if (!isPanel && !isToast) void setupFileSync();

// The main window gets the cloud providers only when both envs are present; the panel and
// toast always render bare (they must never mount Clerk/Convex).
const mainView =
  CLERK_KEY && convex ? (
    <ClerkProvider publishableKey={CLERK_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  ) : (
    <App />
  );

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPanel ? <FloatingPanel /> : isToast ? <Toast /> : mainView}
  </React.StrictMode>,
);
