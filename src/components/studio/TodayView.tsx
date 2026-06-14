import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { formatMinute } from "@/lib/engine";
import type { Block, Settings } from "@/lib/engine";
import { exerciseContext, variantLabel } from "@/domain/seed";
import { MUSCLE_LABEL } from "@/domain/types";
import { useCatalog } from "@/hooks/useCatalog";
import { nowMinutes, useStore } from "@/store/useStore";

const DOW = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];
const pad = (n: number) => String(n).padStart(2, "0");
const hh = (min: number) => pad(Math.round(min / 60));
const NEXT_BG = "color-mix(in oklch, var(--acc) 5%, transparent)";
/** Show the quick actions only when the set is due or this many minutes away. */
const ACTION_THRESHOLD_MIN = 5;

export function TodayView() {
  const day = useStore((s) => s.day);
  const settings = useStore((s) => s.settings);
  const done = useStore((s) => s.done);
  const decline = useStore((s) => s.decline);
  const snooze = useStore((s) => s.snooze);
  const { byId } = useCatalog();
  const [now, setNow] = useState(nowMinutes());

  useEffect(() => {
    const handle = setInterval(() => setNow(nowMinutes()), 20_000);
    return () => clearInterval(handle);
  }, []);

  if (!day) return null;
  const weekday = DOW[(new Date().getDay() + 6) % 7];

  if (day.rest) {
    return (
      <div className="flex flex-col px-[34px] py-[30px]">
        <Mast weekday={weekday} dayType="DESCANSO" settings={settings} done={0} total={0} pct={0} />
        <div className="mt-2 border border-[var(--rule2)] p-10 text-center">
          <div className="text-[34px] font-extrabold tracking-[-0.03em] text-[var(--fg)] uppercase">
            Día de descanso
          </div>
          <div className="mt-2 font-mono text-[11px] tracking-[0.1em] text-[var(--faint)] uppercase">
            Hoy toca recuperar · mañana seguimos
          </div>
        </div>
      </div>
    );
  }

  const total = day.blocks.length;
  const doneCount = day.blocks.filter((b) => b.status === "done").length;
  const pct = total ? (doneCount / total) * 100 : 0;
  const next = day.blocks
    .filter((b) => (b.status === "pending" || b.status === "snoozed") && b.time >= 0)
    .sort((a, b) => a.time - b.time)[0];

  const muscleOf = (b: Block) => {
    const ex = byId(b.exerciseId);
    return ex ? MUSCLE_LABEL[ex.muscle].toUpperCase() : "";
  };
  const repsOf = (b: Block) => b.target ?? byId(b.exerciseId)?.defaultReps ?? "";

  const eta = next ? next.time - now : 0;
  const isDue = eta <= 0;
  const showActions = !!next && eta <= ACTION_THRESHOLD_MIN;
  const heroH = Math.floor(Math.max(eta, 0) / 60);
  const heroM = Math.max(eta, 0) % 60;
  const heroNum = eta < 60 ? String(Math.max(eta, 0)) : `${heroH}:${String(heroM).padStart(2, "0")}`;
  const heroUnit = eta < 60 ? "MIN" : "H";
  const nextEx = next ? byId(next.exerciseId) : undefined;
  const nextMeta = next
    ? [
        nextEx && exerciseContext(nextEx) === "desk" ? "DE ESCRITORIO" : "",
        `${repsOf(next)} REPS`,
        variantLabel(next.exerciseId, next.variantId).toUpperCase(),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="flex flex-col px-[34px] py-[30px]">
      <Mast
        weekday={weekday}
        dayType={(day.dayTypeName ?? "").toUpperCase()}
        settings={settings}
        done={doneCount}
        total={total}
        pct={pct}
      />

      {next ? (
        showActions ? (
          <div className="flex items-center justify-between gap-6 bg-[var(--acc)] px-[26px] py-[22px] text-[var(--on)]">
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-semibold tracking-[0.2em]">
                {isDue ? "AHORA" : `EN ${eta} MIN`} — {formatMinute(next.time)}
              </div>
              <div className="mt-2 text-[46px] leading-[0.95] font-extrabold tracking-[-0.04em] uppercase">
                {next.name}
              </div>
              <div className="mt-2 font-mono text-[12.5px] tracking-[0.04em] opacity-70">
                {nextMeta}
              </div>
            </div>
            <div className="flex flex-none flex-col gap-2">
              <button
                onClick={() => done(next.id)}
                className="flex items-center justify-center gap-2 bg-[var(--on)] px-[26px] py-[13px] font-mono text-[13px] font-semibold tracking-[0.08em] text-[var(--acc)]"
              >
                <Check className="size-4" strokeWidth={3} /> HECHO
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => snooze(next.id, 30)}
                  className="flex-1 border-2 border-[var(--on)] px-4 py-[11px] font-mono text-[11.5px] font-semibold tracking-[0.06em]"
                >
                  POSPONER
                </button>
                <button
                  onClick={() => decline(next.id)}
                  className="flex-1 border-2 px-4 py-[11px] font-mono text-[11.5px] font-semibold tracking-[0.06em]"
                  style={{ borderColor: "rgba(10,10,10,0.35)" }}
                >
                  AHORA NO
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="flex items-center justify-between gap-6 border border-[var(--rule2)] px-[26px] py-[22px]"
            style={{ borderLeft: "3px solid var(--acc)" }}
          >
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-semibold tracking-[0.2em] text-[var(--faint)]">
                PRÓXIMA — {formatMinute(next.time)}
              </div>
              <div className="mt-2 text-[46px] leading-[0.95] font-extrabold tracking-[-0.04em] text-[var(--fg)] uppercase">
                {next.name}
              </div>
              <div className="mt-2 font-mono text-[12.5px] tracking-[0.04em] text-[var(--faint)]">
                {nextMeta}
              </div>
            </div>
            <div className="flex-none text-right">
              <div className="font-mono text-[52px] leading-[0.8] font-semibold tabular-nums tracking-[-0.03em] text-[var(--fg)]">
                {heroNum}
              </div>
              <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-[var(--faint)]">
                {heroUnit === "MIN" ? "MINUTOS" : "HORAS"}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="border border-[var(--rule2)] p-5 font-mono text-[12px] tracking-[0.04em] text-[var(--faint)]">
          {total > 0
            ? "FUERA DE HORARIO · MAÑANA SE REPARTEN DE NUEVO"
            : "SIN EJERCICIOS — ARMÁ TU RUTINA"}
        </div>
      )}

      <div className="mt-[26px] flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--faint)]">
          EL DÍA — {total} SERIES
        </span>
      </div>
      <div className="mt-3 h-px bg-[var(--rule2)]" />
      {day.blocks.map((b, i) => (
        <DayRow
          key={b.id}
          block={b}
          idx={i + 1}
          isNext={b.id === next?.id}
          nextDue={showActions}
          muscle={muscleOf(b)}
          reps={repsOf(b)}
        />
      ))}
    </div>
  );
}

function Mast({
  weekday,
  dayType,
  settings,
  done,
  total,
  pct,
}: {
  weekday: string;
  dayType: string;
  settings: Settings;
  done: number;
  total: number;
  pct: number;
}) {
  return (
    <>
      <div className="flex items-end justify-between gap-5">
        <div>
          <h2 className="text-[68px] leading-[0.82] font-extrabold tracking-[-0.05em] text-[var(--fg)]">
            HOY
          </h2>
          <div className="mt-3.5 font-mono text-[10.5px] tracking-[0.12em] text-[var(--faint)]">
            {[weekday, dayType, `${hh(settings.workWindow.start)}–${hh(settings.workWindow.end)}H`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[52px] leading-[0.8] font-semibold tracking-[-0.02em] text-[var(--fg)]">
            {pad(done)}
            <span className="text-[var(--faint2)]">/{pad(total)}</span>
          </div>
          <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-[var(--faint)]">
            SERIES HECHAS
          </div>
        </div>
      </div>
      <div className="mt-5 h-[3px] bg-[var(--fg)]" />
      <div className="mb-[22px] flex h-[5px]">
        <div className="bg-[var(--acc)]" style={{ width: `${pct}%` }} />
        <div className="flex-1 bg-[var(--bar0)]" />
      </div>
    </>
  );
}

function DayRow({
  block,
  idx,
  isNext,
  nextDue,
  muscle,
  reps,
}: {
  block: Block;
  idx: number;
  isNext: boolean;
  nextDue: boolean;
  muscle: string;
  reps: string;
}) {
  const isDone = block.status === "done";
  const skip = block.status === "skipped";
  const unsched = block.time < 0;
  let status = "PENDIENTE";
  let statusColor = "var(--faint)";
  if (isDone) [status, statusColor] = ["HECHO", "var(--faint2)"];
  else if (skip) [status, statusColor] = ["SALTADO", "var(--faint2)"];
  else if (isNext) [status, statusColor] = [nextDue ? "AHORA" : "PRÓXIMA", "var(--acc)"];
  else if (unsched) [status, statusColor] = ["NO ENTRA", "var(--faint2)"];

  return (
    <div
      className="relative flex items-center gap-5 border-b border-[var(--rule)] py-[15px]"
      style={{ paddingLeft: isNext ? "14px" : 0, background: isNext ? NEXT_BG : "transparent" }}
    >
      {isNext && <div className="absolute inset-y-0 left-0 w-1 bg-[var(--acc)]" />}
      <span
        className="w-[26px] flex-none font-mono text-[12px]"
        style={{ color: isNext ? "var(--acc)" : "var(--faint2)" }}
      >
        {pad(idx)}
      </span>
      <span
        className="w-[76px] flex-none font-mono text-[21px] font-medium tracking-[-0.01em]"
        style={{ color: isDone || skip ? "var(--faint2)" : isNext ? "var(--acc)" : "var(--dim)" }}
      >
        {unsched ? "—" : formatMinute(block.time)}
      </span>
      <span
        className="flex-1 truncate text-[21px] font-bold tracking-[-0.02em] uppercase"
        style={{
          color: isDone || skip ? "var(--faint2)" : isNext ? "var(--fg)" : "var(--fg2)",
          textDecoration: skip ? "line-through" : "none",
        }}
      >
        {block.name}
      </span>
      <span className="w-[74px] flex-none font-mono text-[10.5px] tracking-[0.1em] text-[var(--faint2)]">
        {muscle}
      </span>
      <span
        className="w-[60px] flex-none text-right font-mono text-[14px]"
        style={{ color: isDone || skip ? "var(--faint2)" : "var(--dim)" }}
      >
        {reps}
      </span>
      <span
        className="w-[86px] flex-none text-right font-mono text-[10.5px] font-semibold tracking-[0.1em]"
        style={{ color: statusColor }}
      >
        {status}
      </span>
    </div>
  );
}
