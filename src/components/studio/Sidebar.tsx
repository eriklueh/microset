import { resolveDark } from "@/lib/theme";
import { useStore } from "@/store/useStore";

export type Section =
  | "coach"
  | "today"
  | "routine"
  | "week"
  | "equipment"
  | "progress"
  | "settings";

const NAV: { id: Section; label: string }[] = [
  { id: "coach", label: "COACH" },
  { id: "today", label: "HOY" },
  { id: "routine", label: "RUTINA" },
  { id: "week", label: "SEMANA" },
  { id: "equipment", label: "EQUIPO" },
  { id: "progress", label: "PROGRESO" },
];

const rowBase =
  "flex w-full items-center gap-3 px-[18px] py-[13px] text-left transition-colors";

export function Sidebar({
  active,
  onSelect,
}: {
  active: Section;
  onSelect: (s: Section) => void;
}) {
  const theme = useStore((s) => s.theme);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const isDark = resolveDark(theme.mode);

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[var(--rule2)] bg-[var(--bg)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--rule2)] px-[18px] py-5">
        <div className="grid size-[26px] place-items-center bg-[var(--acc)] text-[16px] font-extrabold text-[var(--on)]">
          m
        </div>
        <span className="text-[16px] font-extrabold tracking-[-0.03em] text-[var(--fg)]">
          microset
        </span>
      </div>

      <nav className="flex flex-col">
        {NAV.map((item, i) => {
          const on = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`${rowBase} border-t border-[var(--rule)] ${
                on ? "bg-[var(--acc)] text-[var(--on)]" : "text-[var(--dim)] hover:text-[var(--fg)]"
              }`}
            >
              <span className={`font-mono text-[10px] ${on ? "text-[var(--on)] opacity-60" : "text-[var(--faint2)]"}`}>
                {`0${i + 1}`}
              </span>
              <span className="font-mono text-[12.5px] font-semibold tracking-[0.08em]">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col border-t border-[var(--rule2)]">
        <button
          onClick={() => onSelect("settings")}
          className={`${rowBase} ${
            active === "settings"
              ? "bg-[var(--acc)] text-[var(--on)]"
              : "text-[var(--dim)] hover:text-[var(--fg)]"
          }`}
        >
          <span className={`font-mono text-[10px] ${active === "settings" ? "text-[var(--on)] opacity-60" : "text-[var(--faint2)]"}`}>
            07
          </span>
          <span className="font-mono text-[12.5px] font-semibold tracking-[0.08em]">AJUSTES</span>
        </button>
        <button
          onClick={() => setThemeMode(isDark ? "light" : "dark")}
          className={`${rowBase} border-t border-[var(--rule)] text-[var(--dim)] hover:text-[var(--fg)]`}
        >
          <span className="font-mono text-[10px] text-[var(--faint2)]">◐</span>
          <span className="font-mono text-[12.5px] font-semibold tracking-[0.08em]">
            {isDark ? "TEMA CLARO" : "TEMA OSCURO"}
          </span>
        </button>
      </div>
    </aside>
  );
}
