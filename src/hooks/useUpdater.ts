import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

/** Download/install lifecycle for the offered update (separate from the check status). */
type Phase = "idle" | "downloading" | "ready" | "error";

/**
 * High-level state of an update *check*:
 *  - idle:       no check has run (or one is queued)
 *  - checking:   a check is in flight
 *  - upToDate:   the check returned no newer version
 *  - available:  a newer signed release was found (see `version`)
 *  - error:      the check itself failed (offline / no manifest / dev build)
 */
export type CheckStatus = "idle" | "checking" | "upToDate" | "available" | "error";

/**
 * Checks the configured updater endpoint once on mount, and on demand via `recheck()`. If a newer
 * version is published (signed manifest at the GitHub release), exposes it so the UI can offer a
 * one-click download + install + relaunch. The auto-check on mount swallows failures silently
 * (status just stays non-`available`); a manual `recheck()` surfaces the `checking`/`error`
 * states so Ajustes can give explicit feedback ("Buscar actualizaciones").
 */
export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const checking = useRef(false);

  const run = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setStatus("checking");
    try {
      const u = await check();
      setUpdate(u);
      setStatus(u ? "available" : "upToDate");
    } catch {
      // offline / no manifest / dev — surface as error; the banner just won't show.
      setStatus("error");
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void getVersion()
      .then((v) => alive && setAppVersion(v))
      .catch(() => {});
    void run();
    return () => {
      alive = false;
    };
  }, [run]);

  // A manual recheck re-arms the banner (clear a previous dismissal) so a freshly found update
  // shows again.
  const recheck = useCallback(() => {
    setDismissed(false);
    void run();
  }, [run]);

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
    status,
    version: update?.version ?? "",
    appVersion,
    notes: update?.body ?? "",
    phase,
    pct,
    install,
    recheck,
    dismiss: () => setDismissed(true),
  };
}
