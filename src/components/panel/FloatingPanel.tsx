import { useEffect, useState } from "react";
import { Check, GripHorizontal, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { formatMinute } from "@/lib/engine";
import { exerciseById } from "@/domain/seed";
import { nowMinutes, useStore } from "@/store/useStore";

/** Compact, translucent always-on-top widget: next set + countdown + quick actions. */
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
  const reps = next ? (next.target ?? exerciseById(next.exerciseId)?.defaultReps ?? "") : "";

  return (
    <div className="bg-card/70 flex h-screen w-screen flex-col overflow-hidden rounded-xl border backdrop-blur-2xl select-none">
      {/* Drag handle — grab here to move the panel. */}
      <div
        data-tauri-drag-region
        className="hover:bg-muted/40 flex h-6 cursor-grab items-center justify-between px-2 transition-colors active:cursor-grabbing"
      >
        <div className="text-muted-foreground/70 pointer-events-none flex items-center gap-1">
          <GripHorizontal className="size-3.5" />
          <span className="text-[10px] font-semibold tracking-widest uppercase">microset</span>
        </div>
        <button
          onClick={() => void getCurrentWindow().hide()}
          className="text-muted-foreground/60 hover:text-foreground"
          aria-label="Ocultar panel"
        >
          <X className="size-3" />
        </button>
      </div>

      {next ? (
        <div className="flex flex-1 flex-col justify-center gap-2 px-3 pb-3">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] leading-tight font-semibold">{next.name}</div>
              <div className="text-muted-foreground text-[11px]">
                {reps} · {formatMinute(next.time)}
              </div>
            </div>
            <div className="text-right leading-none">
              <div className="font-mono text-lg font-semibold tabular-nums">
                {eta <= 0 ? "0" : eta}
              </div>
              <div className="text-muted-foreground text-[9px] tracking-wider uppercase">
                {eta <= 0 ? "ahora" : "min"}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button size="xs" className="h-7 flex-1" onClick={() => done(next.id)}>
              <Check className="size-3.5" /> Hecho
            </Button>
            <Button size="xs" variant="outline" className="h-7" onClick={() => decline(next.id)}>
              Ahora no
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-3 pb-3 text-center text-[11px]">
          Sin series pendientes
        </div>
      )}
    </div>
  );
}
