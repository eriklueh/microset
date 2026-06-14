import { REST, useStore, type WeekKind } from "@/store/useStore";

const CARD = "rounded-xl border bg-card/60 backdrop-blur-xl";
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const todayIdx = (new Date().getDay() + 6) % 7;

export function SemanaView() {
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const dayKind = useStore((s) => s.dayKind);
  const setWeekDay = useStore((s) => s.setWeekDay);
  const setDayKind = useStore((s) => s.setDayKind);

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <p className="text-muted-foreground px-1 pb-1 text-xs">
        Asigná un tipo de día (o descanso) a cada día. Casa/Oficina lo va a usar el coach más
        adelante.
      </p>
      {DAYS.map((name, i) => (
        <div
          key={name}
          className={`${CARD} flex items-center gap-3 p-3 ${i === todayIdx ? "border-primary/40" : ""}`}
        >
          <span className="flex w-24 items-center gap-1.5 text-sm font-medium">
            {name}
            {i === todayIdx && (
              <span className="text-primary text-[10px] font-semibold tracking-wider uppercase">
                hoy
              </span>
            )}
          </span>
          <select
            value={week[i]}
            onChange={(e) => setWeekDay(i, e.currentTarget.value)}
            aria-label={`Tipo de día para ${name}`}
            className="border-input bg-background/40 text-foreground focus:border-ring h-8 flex-1 rounded-md border px-2 text-sm outline-none"
          >
            {dayTypes.map((dt) => (
              <option key={dt.id} value={dt.id} className="bg-popover text-popover-foreground">
                {dt.name}
              </option>
            ))}
            <option value={REST} className="bg-popover text-popover-foreground">
              Descanso
            </option>
          </select>
          <select
            value={dayKind[i] ?? ""}
            onChange={(e) =>
              setDayKind(i, (e.currentTarget.value || null) as WeekKind | null)
            }
            aria-label={`Lugar para ${name}`}
            className="border-input bg-background/40 text-foreground focus:border-ring h-8 w-28 rounded-md border px-2 text-sm outline-none"
          >
            <option value="" className="bg-popover text-popover-foreground">
              —
            </option>
            <option value="home" className="bg-popover text-popover-foreground">
              Casa
            </option>
            <option value="office" className="bg-popover text-popover-foreground">
              Oficina
            </option>
          </select>
        </div>
      ))}
    </div>
  );
}
