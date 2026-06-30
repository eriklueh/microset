import { useEffect, useState } from "react";
import { Barcode, Corners, RegMark } from "./hud";

/** How long the boot sweep lingers before it fades out (ms). Matches ms-scan-once. */
const SPLASH_MS = 720;
/** Fade-out duration before the node unmounts (ms). Matches ms-splash-out. */
const FADE_MS = 240;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Power-on scan splash — a one-shot lime sweep shown once when the Studio mounts,
 * then it fades out and removes itself. Skipped entirely under prefers-reduced-motion
 * (the guard in index.css disables the sweep too). Pure chrome: no logic, no copy beyond
 * the brand mark.
 */
export function BootSplash() {
  // Don't even mount under reduced motion — there's nothing to show without the sweep.
  const [phase, setPhase] = useState<"scan" | "out" | "done">(() =>
    prefersReducedMotion() ? "done" : "scan",
  );

  useEffect(() => {
    if (phase !== "scan") return;
    const toOut = window.setTimeout(() => setPhase("out"), SPLASH_MS);
    const toDone = window.setTimeout(() => setPhase("done"), SPLASH_MS + FADE_MS);
    return () => {
      window.clearTimeout(toOut);
      window.clearTimeout(toDone);
    };
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[var(--bg)] ${
        phase === "out" ? "ms-splash-out" : ""
      }`}
    >
      {/* dotted field */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--faint2) 16%, transparent) 1px, transparent 1.5px)",
          backgroundSize: "16px 16px",
        }}
      />
      {/* the one-shot sweep */}
      <span
        className="ms-scan-once absolute inset-x-0 z-[1] h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--acc), transparent)",
          boxShadow: "0 0 8px color-mix(in oklch, var(--acc) 70%, transparent)",
        }}
      />
      <Corners />
      <RegMark className="top-6 left-1/2 -translate-x-1/2" />
      <RegMark className="bottom-6 left-1/2 -translate-x-1/2" />
      <div className="relative z-[1] flex flex-col items-center gap-3">
        <span className="font-pixel text-[40px] leading-[0.8] tracking-[0.04em] text-[var(--fg)]">
          MICROSET
        </span>
        <Barcode color="var(--acc)" height={12} />
      </div>
    </div>
  );
}
