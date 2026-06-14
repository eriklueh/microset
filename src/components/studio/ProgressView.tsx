import { defaultVariantId, exerciseById } from "@/domain/seed";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";

/** ISO day keys for the last 7 days, oldest → newest. */
function last7Keys(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
}

export function ProgressView() {
  const logs = useStore((s) => s.logs);
  const routine = useStore((s) => s.routine);

  const ids = Array.from(
    new Set([...routine.map((r) => r.exerciseId), ...logs.map((l) => l.exerciseId)]),
  );

  if (logs.length === 0) {
    return (
      <div className={`${CARD} text-muted-foreground p-6 text-center text-sm`}>
        Todavía no registraste series. Marcá ejercicios como{" "}
        <strong className="text-foreground">Hecho</strong> y acá vas a ver tu evolución.
      </div>
    );
  }

  const days = last7Keys();

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {ids.map((id) => {
        const ex = exerciseById(id);
        if (!ex) return null;
        const exLogs = logs.filter((l) => l.exerciseId === id);
        const total = exLogs.length;
        const routineItem = routine.find((r) => r.exerciseId === id);
        const lastLog = exLogs[exLogs.length - 1];
        const currentVariantId =
          routineItem?.variantId ?? lastLog?.variantId ?? defaultVariantId(ex);
        const currentIdx = Math.max(
          0,
          ex.axis.findIndex((v) => v.id === currentVariantId),
        );
        const currentLabel = ex.axis[currentIdx]?.label ?? "";
        const counts = days.map(
          (d) => exLogs.filter((l) => l.at.slice(0, 10) === d).length,
        );
        const last7 = counts.reduce((a, b) => a + b, 0);
        const max = Math.max(1, ...counts);

        return (
          <div key={id} className={`${CARD} flex flex-col gap-3 p-4`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{ex.name}</div>
              <div className="text-muted-foreground font-mono text-xs tabular-nums">
                {total} series
              </div>
            </div>

            {ex.axis.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1">
                  {ex.axis.map((v, i) => (
                    <span
                      key={v.id}
                      className={`h-1.5 flex-1 rounded-full ${i <= currentIdx ? "bg-primary" : "bg-muted"}`}
                    />
                  ))}
                </div>
                <div className="text-muted-foreground text-xs">
                  Nivel actual: <span className="text-foreground">{currentLabel}</span>
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  Últimos 7 días
                </span>
                <span className="font-mono text-xs tabular-nums">{last7} series</span>
              </div>
              <div className="flex h-10 items-end gap-1">
                {counts.map((c, i) => (
                  <div
                    key={i}
                    className="bg-muted/50 flex flex-1 items-end overflow-hidden rounded-sm"
                  >
                    <div
                      className="bg-primary w-full rounded-sm transition-all"
                      style={{ height: `${(c / max) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
