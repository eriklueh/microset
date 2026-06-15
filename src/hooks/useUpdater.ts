import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Phase = "idle" | "downloading" | "ready" | "error";

/**
 * Checks the configured updater endpoint once on mount. If a newer version is
 * published (signed manifest at the GitHub release), exposes it so the UI can
 * offer a one-click download + install + relaunch. All failures (offline, no
 * manifest, dev build) are swallowed — updates must never block the app.
 */
export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    check()
      .then((u) => {
        if (alive && u) setUpdate(u);
      })
      .catch(() => {
        /* offline / no manifest / dev — ignore */
      });
    return () => {
      alive = false;
    };
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setPhase("downloading");
    let total = 0;
    let got = 0;
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          setPct(total ? Math.min(100, Math.round((got / total) * 100)) : 0);
        } else if (e.event === "Finished") {
          setPct(100);
        }
      });
      setPhase("ready");
      await relaunch();
    } catch {
      setPhase("error");
    }
  }, [update]);

  return {
    available: !!update && !dismissed,
    version: update?.version ?? "",
    notes: update?.body ?? "",
    phase,
    pct,
    install,
    dismiss: () => setDismissed(true),
  };
}
