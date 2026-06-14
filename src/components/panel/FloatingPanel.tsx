import { useEffect, useState } from "react";
import { Check, Clock, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { formatMinute } from "@/lib/engine";
import { exerciseById } from "@/domain/seed";
import { nowMinutes, useStore } from "@/store/useStore";

/** Compact always-on-top widget: next set + countdown, with quick actions. */
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

  return (
    <div
      data-tauri-drag-region
      className="bg-card text-card-foreground flex h-screen w-screen cursor-grab flex-col gap-1.5 border p-3 select-none"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-tight">microset</span>
        <button
          onClick={() => void getCurrentWindow().hide()}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Ocultar panel"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {next ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{next.name}</span>
            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs tabular-nums">
              <Clock className="size-3" />
              {eta <= 0 ? "¡ahora!" : `en ${eta}'`}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">
            {exerciseById(next.exerciseId)?.defaultReps ?? ""} · {formatMinute(next.time)}
          </div>
          <div className="mt-0.5 flex gap-1.5">
            <Button size="sm" className="flex-1" onClick={() => done(next.id)}>
              <Check className="size-3.5" /> Hecho
            </Button>
            <Button size="sm" variant="outline" onClick={() => decline(next.id)}>
              Ahora no
            </Button>
          </div>
        </>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center text-xs">
          Sin series pendientes ahora 💪
        </div>
      )}
    </div>
  );
}
