import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatMinute } from "@/lib/engine";
import { exerciseById, variantLabel } from "@/domain/seed";
import { nowMinutes, useStore } from "@/store/useStore";

/** Compact always-on-top widget (Manifiesto): next set + countdown + quick actions. */
export function FloatingPanel() {
  const day = useStore((s) => s.day);
  const done = useStore((s) => s.done);
  const decline = useStore((s) => s.decline);
  const ensureToday = useStore((s) => s.ensureToday);
  const [now, setNow] = useState(nowMinutes());

  useEffect(() => {
    ensureToday();
    const handle = setInterval(() => setNow(nowMinutes()), 20_000);
    return () => clearInterval(handle);
  }, [ensureToday]);

  const next = day?.blocks
    .filter((b) => (b.status === "pending" || b.status === "snoozed") && b.time >= 0)
    .sort((a, b) => a.time - b.time)[0];
  const eta = next ? next.time - now : 0;
  const detail = next
    ? [
        next.target ?? exerciseById(next.exerciseId)?.defaultReps ?? "",
        variantLabel(next.exerciseId, next.variantId),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const isNow = eta <= 0;
  const near = eta > 0 && eta < 60;
  const counter = near ? String(eta) : next ? formatMinute(next.time) : "";
  const counterUnit = near ? "MIN" : "";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden border border-[var(--rule2)] bg-[var(--bg)] text-[var(--fg)] select-none">
      <div
        data-tauri-drag-region
        className="flex h-[26px] flex-none cursor-grab items-center justify-between border-b border-[var(--rule2)] px-2.5 active:cursor-grabbing"
      >
        <span className="pointer-events-none font-mono text-[9px] font-bold tracking-[0.2em] text-[var(--faint)] uppercase">
          microset
        </span>
        <button
          onClick={() => void getCurrentWindow().hide()}
          className="text-[var(--faint2)] hover:text-[var(--fg)]"
          aria-label="Ocultar panel"
        >
          <X className="size-3" />
        </button>
      </div>

      {next ? (
        <div className="flex flex-1 flex-col p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {isNow ? (
                <span className="inline-block bg-[var(--acc)] px-1.5 py-0.5 font-mono text-[8.5px] font-bold tracking-[0.16em] text-[var(--on)]">
                  AHORA
                </span>
              ) : (
                <span className="font-mono text-[8.5px] font-semibold tracking-[0.18em] text-[var(--faint)]">
                  PRÓXIMA
                </span>
              )}
              <div className="mt-1 truncate text-[18px] leading-[0.95] font-extrabold tracking-[-0.02em] text-[var(--fg)] uppercase">
                {next.name}
              </div>
              <div className="mt-1 truncate font-mono text-[9px] tracking-[0.04em] text-[var(--faint2)]">
                {detail.toUpperCase()}
              </div>
            </div>
            {!isNow && (
              <div className="flex-none text-right leading-none">
                <div className="font-mono text-[20px] font-semibold tabular-nums text-[var(--fg)]">
                  {counter}
                </div>
                {counterUnit && (
                  <div className="mt-0.5 font-mono text-[8px] tracking-[0.12em] text-[var(--faint2)] uppercase">
                    {counterUnit}
                  </div>
                )}
              </div>
            )}
          </div>

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
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-3 text-center font-mono text-[10px] tracking-[0.08em] text-[var(--faint)] uppercase">
          Sin series pendientes
        </div>
      )}
    </div>
  );
}
