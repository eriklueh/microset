import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMinute } from "@/lib/engine";
import type { Block } from "@/lib/engine";
import { exerciseById } from "@/domain/seed";
import { ensureNotificationSetup, notifyBlock } from "@/lib/notify";
import { useStore } from "@/store/useStore";

function repsOf(block: Block): string {
  return exerciseById(block.exerciseId)?.defaultReps ?? "";
}

export function TodayView() {
  const day = useStore((s) => s.day);
  const done = useStore((s) => s.done);
  const decline = useStore((s) => s.decline);
  const snooze = useStore((s) => s.snooze);

  if (!day || day.blocks.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border p-6 text-center text-sm">
        No hay rutina cargada. Andá a <strong>Rutina</strong> para armar tu día.
      </div>
    );
  }

  const doneCount = day.blocks.filter((b) => b.status === "done").length;
  const overflow = day.blocks.filter(
    (b) => b.time < 0 && b.status !== "skipped",
  );
  const next = day.blocks
    .filter((b) => (b.status === "pending" || b.status === "snoozed") && b.time >= 0)
    .sort((a, b) => a.time - b.time)[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          {doneCount} / {day.blocks.length} series hechas
        </span>
        <div className="flex items-center gap-2">
          {overflow.length > 0 && (
            <Badge variant="destructive">{overflow.length} no entran</Badge>
          )}
          {next && (
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                await ensureNotificationSetup();
                notifyBlock(next);
              }}
            >
              Probar aviso
            </Button>
          )}
        </div>
      </div>

      {next && (
        <div className="border-primary/30 bg-primary/5 flex flex-col gap-3 rounded-xl border p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Clock className="size-3.5" /> Próximo · {formatMinute(next.time)}
          </div>
          <div>
            <div className="text-lg font-semibold">{next.name}</div>
            {repsOf(next) && (
              <div className="text-muted-foreground text-sm">{repsOf(next)}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => done(next.id)}>
              <Check className="size-4" /> Hecho
            </Button>
            <Button variant="outline" onClick={() => snooze(next.id, 30)}>
              Posponer 30'
            </Button>
            <Button variant="ghost" onClick={() => decline(next.id)}>
              Ahora no
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {day.blocks.map((block) => (
          <TimelineRow key={block.id} block={block} onDone={() => done(block.id)} />
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Block["status"] }) {
  if (status === "done") return <Badge variant="secondary">Hecho</Badge>;
  if (status === "skipped") return <Badge variant="outline">Saltado</Badge>;
  if (status === "snoozed") return <Badge variant="outline">Pospuesto</Badge>;
  return null;
}

function TimelineRow({
  block,
  onDone,
}: {
  block: Block;
  onDone: () => void;
}) {
  const isDone = block.status === "done";
  const unscheduled = block.time < 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      <span className="text-muted-foreground w-12 tabular-nums">
        {unscheduled ? "—" : formatMinute(block.time)}
      </span>
      <span className={"flex-1 " + (isDone ? "text-muted-foreground line-through" : "")}>
        {block.name}
      </span>
      <StatusBadge status={block.status} />
      {(block.status === "pending" || block.status === "snoozed") && !unscheduled && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onDone}
          aria-label="Marcar hecho"
        >
          <Check className="size-4" />
        </Button>
      )}
    </div>
  );
}
