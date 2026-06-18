import { useEffect, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatMinute } from "@/lib/engine";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { nowMinutes, useStore } from "@/store/useStore";
import { Barcode, Corners } from "@/components/studio/hud";

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
  const snooze = useStore((s) => s.snooze);
  const snoozeMinutes = useStore((s) => s.snoozeMinutes);
  const ensureToday = useStore((s) => s.ensureToday);
  const { byId, name, variantLabel } = useCatalog();
  const t = useT();
  const [now, setNow] = useState(nowMinutes());
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    ensureToday();
    const handle = setInterval(() => setNow(nowMinutes()), 20_000);
    return () => clearInterval(handle);
  }, [ensureToday]);

  // After "MÁS TARDE", briefly confirm where the set went so it never reads as "skipped".
  if (outcome) {
    return (
      <Shell isNow={false}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <span className="ms-blink inline-block size-1.5 bg-[var(--acc)]" />
          <span className="font-mono text-[10.5px] leading-[1.4] tracking-[0.06em] text-[var(--fg)] uppercase">
            {outcome}
          </span>
        </div>
      </Shell>
    );
  }

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
            {t.panel.noSets}
          </span>
        </div>
      </Shell>
    );
  }

  const eta = next.time - now;
  const isNow = eta <= 0;
  const soon = eta > 0 && eta <= ACTION_THRESHOLD_MIN;

  const ex = byId(next.exerciseId);
  const muscle = ex ? t.muscle[ex.muscle].toUpperCase() : "";
  const reps = next.target ?? ex?.defaultReps ?? "";
  const caption = [reps ? `${reps} ${t.panel.reps}` : "", variantLabel(next.exerciseId, next.variantId).toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  // HECHO advances silently; MÁS TARDE reschedules (snooze) and flashes where it landed.
  const act = (kind: "done" | "later") => {
    const exName = name(next.exerciseId);
    if (kind === "done") {
      done(next.id);
      return;
    }
    snooze(next.id, snoozeMinutes);
    const moved = useStore.getState().day?.blocks.find((b) => b.id === next.id);
    setOutcome(moved && moved.time >= 0 ? `${exName} → ${formatMinute(moved.time)}` : exName);
    window.setTimeout(() => setOutcome(null), 1800);
  };

  // ----- Now: full lime takeover ------------------------------------------
  if (isNow) {
    return (
      <Shell isNow>
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <span className="font-mono text-[9px] font-bold tracking-[0.22em]">{t.panel.now}</span>
          <span className="truncate text-[22px] leading-[0.95] font-extrabold tracking-[-0.02em] uppercase">
            {name(next.exerciseId)}
          </span>
          {caption && (
            <span className="truncate font-mono text-[9px] tracking-[0.04em] opacity-70">{caption}</span>
          )}
          <div className="mt-auto flex gap-1.5">
            <button
              onClick={() => act("done")}
              className="flex flex-1 items-center justify-center gap-1 bg-[var(--on)] py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--acc)]"
            >
              <Check className="size-3" strokeWidth={3} /> {t.actions.done}
            </button>
            <button
              onClick={() => act("later")}
              className="border px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--on)]"
              style={{ borderColor: BLACK_A(0.4) }}
            >
              {t.actions.later}
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
  const heroUnit = eta < 60 ? t.panel.min : t.panel.h;

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
          {t.panel.next}{muscle ? ` · ${muscle}` : ""}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-pixel leading-[0.8] tabular-nums tracking-[-0.01em]"
            style={{ fontSize: soon ? "34px" : "40px", color: soon ? "var(--acc)" : "var(--fg)" }}
          >
            {heroNum}
          </span>
          <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-[var(--faint)]">
            {heroUnit}
          </span>
        </div>
        <span className="truncate text-[13px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
          {name(next.exerciseId)}
        </span>
        {caption && (
          <span className="truncate font-mono text-[8.5px] tracking-[0.04em] text-[var(--faint2)]">
            {caption}
          </span>
        )}

        {soon ? (
          <div className="mt-auto flex gap-1.5">
            <button
              onClick={() => act("done")}
              className="flex flex-1 items-center justify-center gap-1 bg-[var(--acc)] py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--on)]"
            >
              <Check className="size-3" strokeWidth={3} /> {t.actions.done}
            </button>
            <button
              onClick={() => act("later")}
              className="border border-[var(--rule2)] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--dim)] hover:border-[var(--fg)] hover:text-[var(--fg)]"
            >
              {t.actions.later}
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
        <div className="pointer-events-none flex items-center gap-2">
          <Barcode color={isNow ? "var(--on)" : "var(--acc)"} height={8} />
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
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!isNow && (
          <>
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle, color-mix(in oklch, var(--faint2) 13%, transparent) 1px, transparent 1.5px)",
                backgroundSize: "13px 13px",
              }}
            />
            <Corners />
          </>
        )}
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
