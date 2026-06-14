import { Bell, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMinute } from "@/lib/engine";
import type { Block } from "@/lib/engine";
import { exerciseById, variantLabel } from "@/domain/seed";
import { ensureNotificationSetup, notifyBlock } from "@/lib/notify";
import { useStore } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";

function repsOf(block: Block): string {
  return block.target ?? exerciseById(block.exerciseId)?.defaultReps ?? "";
}

export function TodayView() {
  const day = useStore((s) => s.day);
  const done = useStore((s) => s.done);
  const decline = useStore((s) => s.decline);
  const snooze = useStore((s) => s.snooze);

  if (!day) return null;

  if (day.rest) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-1 p-10 text-center`}>
        <span className="text-lg font-semibold">Día de descanso</span>
        <span className="text-muted-foreground text-sm">
          Hoy toca recuperar. Mañana seguimos.
        </span>
      </div>
    );
  }

  if (day.blocks.length === 0) {
    return (
      <div className={`${CARD} text-muted-foreground p-6 text-center text-sm`}>
        No hay ejercicios para hoy. Andá a{" "}
        <strong className="text-foreground">Rutina</strong> para armar tu día.
      </div>
    );
  }

  const doneCount = day.blocks.filter((b) => b.status === "done").length;
  const total = day.blocks.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const overflow = day.blocks.filter((b) => b.time < 0 && b.status !== "skipped");
  const next = day.blocks
    .filter((b) => (b.status === "pending" || b.status === "snoozed") && b.time >= 0)
    .sort((a, b) => a.time - b.time)[0];
  const testBlock =
    next ??
    day.blocks.find((b) => b.status === "pending" || b.status === "snoozed") ??
    day.blocks[0];

  return (
    <div className="flex flex-col gap-3">
      {day.dayTypeName && (
        <div className="text-muted-foreground px-0.5 text-xs">
          Tipo de día: <span className="text-foreground font-medium">{day.dayTypeName}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Progreso de hoy
            </span>
            <span className="font-mono text-xs tabular-nums">
              {doneCount}/{total}
            </span>
          </div>
          <div className="bg-muted/60 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Probar aviso"
          onClick={async () => {
            await ensureNotificationSetup();
            if (testBlock) notifyBlock(testBlock);
          }}
        >
          <Bell className="size-4" />
        </Button>
      </div>

      {next ? (
        <div className={`${CARD} relative overflow-hidden p-4`}>
          <div className="bg-primary absolute inset-x-0 top-0 h-0.5" />
          <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
            <Clock className="size-3" /> Próximo ·{" "}
            <span className="font-mono">{formatMinute(next.time)}</span>
          </div>
          <div className="text-xl font-semibold tracking-tight">{next.name}</div>
          <div className="text-muted-foreground text-sm">
            {[repsOf(next), variantLabel(next.exerciseId, next.variantId)]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => done(next.id)}>
              <Check className="size-4" /> Hecho
            </Button>
            <Button size="sm" variant="outline" onClick={() => snooze(next.id, 30)}>
              Posponer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => decline(next.id)}>
              Ahora no
            </Button>
          </div>
        </div>
      ) : (
        <div className={`${CARD} text-muted-foreground p-4 text-sm`}>
          {overflow.length > 0
            ? "No hay más series para hoy (fuera de tu horario laboral). Mañana se reparten de nuevo."
            : "Todo listo por hoy."}
        </div>
      )}

      <div className="flex flex-col gap-1 pt-1">
        <span className="text-muted-foreground px-1 pb-1 text-[11px] font-medium tracking-wider uppercase">
          Línea del día
        </span>
        {day.blocks.map((b) => (
          <Row
            key={b.id}
            block={b}
            isNext={b.id === next?.id}
            onDone={() => done(b.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StatusDot({ block, isNext }: { block: Block; isNext: boolean }) {
  if (block.status === "done")
    return <span className="bg-primary size-1.5 shrink-0 rounded-full" />;
  if (block.status === "skipped")
    return <span className="bg-muted-foreground/40 size-1.5 shrink-0 rounded-full" />;
  if (block.time < 0)
    return <span className="bg-destructive/60 size-1.5 shrink-0 rounded-full" />;
  return (
    <span
      className={`size-1.5 shrink-0 rounded-full ${
        isNext ? "bg-primary ring-primary/30 ring-4" : "bg-muted-foreground/30"
      }`}
    />
  );
}

function Row({
  block,
  isNext,
  onDone,
}: {
  block: Block;
  isNext: boolean;
  onDone: () => void;
}) {
  const unscheduled = block.time < 0;
  const isDone = block.status === "done";
  const actionable =
    (block.status === "pending" || block.status === "snoozed") && !unscheduled;

  return (
    <div
      className={`group flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
        isNext
          ? "border-primary/40 bg-primary/5"
          : "hover:bg-muted/40 border-transparent hover:border-border"
      }`}
    >
      <StatusDot block={block} isNext={isNext} />
      <span className="text-muted-foreground w-11 shrink-0 font-mono text-xs tabular-nums">
        {unscheduled ? "—" : formatMinute(block.time)}
      </span>
      <span className={`flex-1 truncate ${isDone ? "text-muted-foreground line-through" : ""}`}>
        {block.name}
      </span>
      <span className="text-muted-foreground shrink-0 font-mono text-xs">
        {repsOf(block)}
      </span>
      {actionable && (
        <Button
          size="icon-xs"
          variant="ghost"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onDone}
          aria-label="Marcar hecho"
        >
          <Check className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
