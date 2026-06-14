import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { defaultVariantId, exerciseById } from "@/domain/seed";
import type { LogEntry } from "@/domain/types";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";
const DAY = 86_400_000;
/** Sets at the current level (last 14 days) needed to suggest the next level. */
const LEVEL_UP_THRESHOLD = 8;

function isoAgo(daysAgo: number, now: number): string {
  return new Date(now - daysAgo * DAY).toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function ProgressView() {
  const logs = useStore((s) => s.logs);
  const routine = useStore((s) => s.routine);

  if (logs.length === 0) {
    return (
      <div className={`${CARD} text-muted-foreground p-6 text-center text-sm`}>
        Todavía no registraste series. Marcá ejercicios como{" "}
        <strong className="text-foreground">Hecho</strong> y acá vas a ver tu evolución.
      </div>
    );
  }

  const now = Date.now();
  const inLast7 = (l: LogEntry) => Date.parse(l.at) >= now - 7 * DAY;
  const inPrev7 = (l: LogEntry) => {
    const t = Date.parse(l.at);
    return t >= now - 14 * DAY && t < now - 7 * DAY;
  };

  const thisWeek = logs.filter(inLast7).length;
  const lastWeek = logs.filter(inPrev7).length;
  const activeExercises = new Set(logs.map((l) => l.exerciseId)).size;

  const activeDays = new Set(logs.map((l) => l.at.slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    if (activeDays.has(isoAgo(i, now))) streak++;
    else if (i === 0) continue;
    else break;
  }

  const ids = Array.from(new Set(logs.map((l) => l.exerciseId)));

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className={`${CARD} grid grid-cols-3 gap-3 p-4`}>
        <Stat label="Esta semana" value={thisWeek} unit="series" delta={thisWeek - lastWeek} />
        <Stat label="Racha" value={streak} unit={streak === 1 ? "día" : "días"} />
        <Stat label="Activos" value={activeExercises} unit="ejercicios" />
      </div>

      {ids.map((id) => (
        <ExerciseProgress
          key={id}
          id={id}
          logs={logs.filter((l) => l.exerciseId === id)}
          routineVariantId={routine.find((r) => r.exerciseId === id)?.variantId}
          now={now}
          inLast7={inLast7}
          inPrev7={inPrev7}
        />
      ))}
    </div>
  );
}

function ExerciseProgress({
  id,
  logs,
  routineVariantId,
  now,
  inLast7,
  inPrev7,
}: {
  id: string;
  logs: LogEntry[];
  routineVariantId?: string;
  now: number;
  inLast7: (l: LogEntry) => boolean;
  inPrev7: (l: LogEntry) => boolean;
}) {
  const ex = exerciseById(id);
  if (!ex) return null;

  const sorted = [...logs].sort((a, b) => (a.at < b.at ? -1 : 1));
  const lastLog = sorted[sorted.length - 1];
  const currentVariantId = routineVariantId ?? lastLog?.variantId ?? defaultVariantId(ex);
  const currentIdx = Math.max(
    0,
    ex.axis.findIndex((v) => v.id === currentVariantId),
  );
  const currentLabel = ex.axis[currentIdx]?.label ?? "";
  const nextLabel = ex.axis[currentIdx + 1]?.label;

  let reachedAt: string | undefined;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].variantId === currentVariantId) reachedAt = sorted[i].at;
    else break;
  }

  const recentAtCurrent = logs.filter(
    (l) => l.variantId === currentVariantId && Date.parse(l.at) >= now - 14 * DAY,
  ).length;
  const readyToLevel = !!nextLabel && recentAtCurrent >= LEVEL_UP_THRESHOLD;

  const days = Array.from({ length: 7 }, (_, i) => isoAgo(6 - i, now));
  const counts = days.map((d) => logs.filter((l) => l.at.slice(0, 10) === d).length);
  const max = Math.max(1, ...counts);
  const wkThis = logs.filter(inLast7).length;
  const wkPrev = logs.filter(inPrev7).length;

  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{ex.name}</div>
        <div className="text-muted-foreground font-mono text-xs tabular-nums">
          {logs.length} series
        </div>
      </div>

      {ex.axis.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            {ex.axis.map((v, i) => (
              <span
                key={v.id}
                className={`flex-1 rounded-full ${
                  i === currentIdx
                    ? "bg-primary h-2"
                    : i < currentIdx
                      ? "bg-primary/40 h-1.5 self-center"
                      : "bg-muted h-1.5 self-center"
                }`}
              />
            ))}
          </div>
          <div className="text-xs">
            <span className="text-foreground">Estás en {currentLabel}</span>
            {reachedAt && (
              <span className="text-muted-foreground"> · desde {shortDate(reachedAt)}</span>
            )}
            <span className="text-muted-foreground">
              {nextLabel ? ` · siguiente: ${nextLabel}` : " · nivel máximo"}
            </span>
          </div>
          {readyToLevel && (
            <span className="bg-primary/15 text-primary inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium">
              Listo para probar {nextLabel}
            </span>
          )}
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Últimos 7 días
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-xs tabular-nums">{wkThis} series</span>
            <Delta value={wkThis - wkPrev} />
          </span>
        </div>
        <div className="flex h-12 items-end gap-1">
          {counts.map((c, i) => (
            <div
              key={i}
              className="bg-muted/40 relative h-full flex-1 overflow-hidden rounded-sm"
            >
              <div
                className="bg-primary absolute inset-x-0 bottom-0 rounded-sm transition-all"
                style={{ height: `${(c / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  delta,
}: {
  label: string;
  value: number;
  unit: string;
  delta?: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <span className="text-muted-foreground text-[11px]">{unit}</span>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="text-primary flex items-center gap-0.5 text-xs font-medium">
        <ArrowUp className="size-3" />
        {value}
      </span>
    );
  if (value < 0)
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-amber-500">
        <ArrowDown className="size-3" />
        {Math.abs(value)}
      </span>
    );
  return <Minus className="text-muted-foreground size-3" />;
}
