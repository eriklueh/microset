import { useEffect, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { variantLabel } from "@/domain/seed";
import { MUSCLE_LABEL } from "@/domain/types";
import { useCatalog } from "@/hooks/useCatalog";
import { nowMinutes, useStore } from "@/store/useStore";

/** Surface the quick actions only when the set is due or this many minutes away. */
const ACTION_THRESHOLD_MIN = 5;
/** Fallback spacing (min) for the proximity hairline when there's no previous set. */
const DEFAULT_SPAN_MIN = 90;
const BLACK_A = (a: number) => `rgba(10,10,10,${a})`;

/**
 * Compact always-on-top widget (Manifiesto). Three escalating states:
 *  · far  (> 5 min)  → giant mono countdown is the hero, no buttons.
 *  · soon (≤ 5 min)  → countdown turns lime + actions appear.
 *  · now  (due)      → full lime takeover, exercise name is the hero.
 */
export function FloatingPanel() {
  const day = useStore((s) => s.day);
  const done = useStore((s) => s.done);
  const decline = useStore((s) => s.decline);
  const ensureToday = useStore((s) => s.ensureToday);
  const { byId } = useCatalog();
  const [now, setNow] = useState(nowMinutes());

  useEffect(() => {
    ensureToday();
    const handle = setInterval(() => setNow(nowMinutes()), 20_000);
    return () => clearInterval(handle);
  }, [ensureToday]);

  const next = day?.blocks
    .filter((b) => (b.status === "pending" || b.status === "snoozed") && b.time >= 0)
    .sort((a, b) => a.time - b.time)[0];

  // ----- Empty state -------------------------------------------------------
  if (!next) {
    return (
      <Shell isNow={false}>
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
          <span className="size-2 bg-[var(--faint2)]" />
          <span className="font-mono text-[9.5px] tracking-[0.16em] text-[var(--faint)] uppercase">
            Sin series
          </span>
        </div>
      </Shell>
    );
  }

  const eta = next.time - now;
  const isNow = eta <= 0;
  const soon = eta > 0 && eta <= ACTION_THRESHOLD_MIN;

  const ex = byId(next.exerciseId);
  const muscle = ex ? MUSCLE_LABEL[ex.muscle].toUpperCase() : "";
  const reps = next.target ?? ex?.defaultReps ?? "";
  const caption = [reps ? `${reps} REPS` : "", variantLabel(next.exerciseId, next.variantId).toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  // ----- Now: full lime takeover ------------------------------------------
  if (isNow) {
    return (
      <Shell isNow>
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <span className="font-mono text-[9px] font-bold tracking-[0.22em]">AHORA</span>
          <span className="truncate text-[22px] leading-[0.95] font-extrabold tracking-[-0.02em] uppercase">
            {next.name}
          </span>
          {caption && (
            <span className="truncate font-mono text-[9px] tracking-[0.04em] opacity-70">{caption}</span>
          )}
          <div className="mt-auto flex gap-1.5">
            <button
              onClick={() => done(next.id)}
              className="flex flex-1 items-center justify-center gap-1 bg-[var(--on)] py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--acc)]"
            >
              <Check className="size-3" strokeWidth={3} /> HECHO
            </button>
            <button
              onClick={() => decline(next.id)}
              className="border px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--on)]"
              style={{ borderColor: BLACK_A(0.4) }}
            >
              AHORA NO
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ----- Far / Soon: countdown is the hero --------------------------------
  const h = Math.floor(eta / 60);
  const m = eta % 60;
  const heroNum = eta < 60 ? String(eta) : `${h}:${String(m).padStart(2, "0")}`;
  const heroUnit = eta < 60 ? "MIN" : "H";

  // Proximity hairline: fill from the previous set's time to this one.
  const prevTime = Math.max(
    next.time - DEFAULT_SPAN_MIN,
    ...(day?.blocks.filter((b) => b.time >= 0 && b.time < next.time).map((b) => b.time) ?? []),
  );
  const span = Math.max(1, next.time - prevTime);
  const progress = Math.min(1, Math.max(0, (now - prevTime) / span));

  return (
    <Shell isNow={false}>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="font-mono text-[8.5px] font-semibold tracking-[0.18em] text-[var(--faint)]">
          PRÓXIMA{muscle ? ` · ${muscle}` : ""}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-mono leading-[0.8] font-semibold tabular-nums tracking-[-0.04em]"
            style={{ fontSize: soon ? "38px" : "44px", color: soon ? "var(--acc)" : "var(--fg)" }}
          >
            {heroNum}
          </span>
          <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--faint)]">
            {heroUnit}
          </span>
        </div>
        <span className="truncate text-[13px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
          {next.name}
        </span>
        {caption && (
          <span className="truncate font-mono text-[8.5px] tracking-[0.04em] text-[var(--faint2)]">
            {caption}
          </span>
        )}

        {soon ? (
          <div className="mt-auto flex gap-1.5">
            <button
              onClick={() => done(next.id)}
              className="flex flex-1 items-center justify-center gap-1 bg-[var(--acc)] py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--on)]"
            >
              <Check className="size-3" strokeWidth={3} /> HECHO
            </button>
            <button
              onClick={() => decline(next.id)}
              className="border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
            >
              AHORA NO
            </button>
          </div>
        ) : (
          <div className="mt-auto flex h-[3px] w-full">
            <div className="bg-[var(--acc)]" style={{ width: `${progress * 100}%` }} />
            <div className="flex-1 bg-[var(--bar0)]" />
          </div>
        )}
      </div>
    </Shell>
  );
}

/** Window chrome: opaque frame + drag bar with a lime brand mark; lime takeover when due. */
function Shell({ isNow, children }: { isNow: boolean; children: ReactNode }) {
  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden border select-none"
      style={{
        background: isNow ? "var(--acc)" : "var(--bg)",
        color: isNow ? "var(--on)" : "var(--fg)",
        borderColor: isNow ? BLACK_A(0.18) : "var(--rule2)",
      }}
    >
      <div
        data-tauri-drag-region
        className="flex h-[26px] flex-none cursor-grab items-center justify-between px-2.5 active:cursor-grabbing"
        style={{ borderBottom: `1px solid ${isNow ? BLACK_A(0.15) : "var(--rule2)"}` }}
      >
        <div className="pointer-events-none flex items-center gap-1.5">
          <span className="size-2" style={{ background: isNow ? "var(--on)" : "var(--acc)" }} />
          <span
            className="font-mono text-[9px] font-bold tracking-[0.2em]"
            style={{ color: isNow ? "var(--on)" : "var(--faint)" }}
          >
            microset
          </span>
        </div>
        <button
          onClick={() => void getCurrentWindow().hide()}
          aria-label="Ocultar panel"
          style={{ color: isNow ? "var(--on)" : "var(--faint2)" }}
          className="hover:opacity-100 opacity-70"
        >
          <X className="size-3" />
        </button>
      </div>
      {children}
    </div>
  );
}
