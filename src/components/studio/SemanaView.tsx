import { Masthead } from "./Masthead";
import { REST, useStore, type WeekKind } from "@/store/useStore";

const DAYS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];
const todayIdx = (new Date().getDay() + 6) % 7;
const NEXT_BG = "color-mix(in oklch, var(--acc) 5%, transparent)";
const selCls =
  "border border-[var(--rule2)] bg-transparent px-3.5 py-[11px] font-mono text-[12.5px] tracking-[0.04em] outline-none";

export function SemanaView() {
  const dayTypes = useStore((s) => s.dayTypes);
  const week = useStore((s) => s.week);
  const dayKind = useStore((s) => s.dayKind);
  const setWeekDay = useStore((s) => s.setWeekDay);
  const setDayKind = useStore((s) => s.setDayKind);

  return (
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="SEMANA" sub="QUÉ HACÉS CADA DÍA" />
      <div className="border-b border-[var(--rule)]">
        {DAYS.map((d, i) => {
          const today = i === todayIdx;
          return (
            <div
              key={d}
              className="relative flex items-center gap-[18px] border-t border-[var(--rule)] py-3.5"
              style={{ paddingLeft: today ? "14px" : 0, background: today ? NEXT_BG : "transparent" }}
            >
              {today && <div className="absolute inset-y-0 left-0 w-1 bg-[var(--acc)]" />}
              <span
                className="w-[132px] flex-none font-mono text-[14px] font-semibold tracking-[0.04em]"
                style={{ color: today ? "var(--acc)" : "var(--fg)" }}
              >
                {d}
              </span>
              <select
                value={week[i]}
                onChange={(e) => setWeekDay(i, e.currentTarget.value)}
                aria-label={`Día ${d}`}
                className={`${selCls} flex-1 appearance-none text-[var(--fg)]`}
              >
                {dayTypes.map((dt) => (
                  <option key={dt.id} value={dt.id} className="bg-[var(--ink2)]">
                    {dt.name.toUpperCase()}
                  </option>
                ))}
                <option value={REST} className="bg-[var(--ink2)]">
                  DESCANSO
                </option>
              </select>
              <select
                value={dayKind[i] ?? ""}
                onChange={(e) => setDayKind(i, (e.currentTarget.value || null) as WeekKind | null)}
                aria-label={`Lugar ${d}`}
                className={`${selCls} w-[150px] flex-none appearance-none`}
                style={{ color: dayKind[i] ? "var(--fg)" : "var(--faint2)" }}
              >
                <option value="" className="bg-[var(--ink2)]">—</option>
                <option value="home" className="bg-[var(--ink2)]">CASA</option>
                <option value="office" className="bg-[var(--ink2)]">OFICINA</option>
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
