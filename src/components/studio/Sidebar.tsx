import { resolveDark } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

export type Section =
  | "coach"
  | "today"
  | "routine"
  | "equipment"
  | "progress"
  | "settings";

const NAV_IDS = ["coach", "today", "routine", "equipment", "progress"] as const;

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
  const t = useT();

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[var(--rule2)] bg-[var(--bg)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--rule2)] px-[18px] py-5">
        <div className="grid size-[26px] place-items-center bg-[var(--acc)] font-pixel text-[17px] text-[var(--on)]">
          m
        </div>
        <span className="font-pixel text-[18px] tracking-[0.02em] text-[var(--fg)]">microset</span>
      </div>

      <nav className="flex flex-col">
        {NAV_IDS.map((id, i) => {
          const on = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`${rowBase} border-t border-[var(--rule)] ${
                on ? "bg-[var(--acc)] text-[var(--on)]" : "text-[var(--dim)] hover:text-[var(--fg)]"
              }`}
            >
              <span className={`font-mono text-[10px] ${on ? "text-[var(--on)] opacity-60" : "text-[var(--faint2)]"}`}>
                {`0${i + 1}`}
              </span>
              <span className="font-mono text-[12.5px] font-semibold tracking-[0.08em]">
                {t.nav[id]}
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
            06
          </span>
          <span className="font-mono text-[12.5px] font-semibold tracking-[0.08em]">{t.nav.settings}</span>
        </button>
        <button
          onClick={() => setThemeMode(isDark ? "light" : "dark")}
          className={`${rowBase} border-t border-[var(--rule)] text-[var(--dim)] hover:text-[var(--fg)]`}
        >
          <span className="font-mono text-[10px] text-[var(--faint2)]">◐</span>
          <span className="font-mono text-[12.5px] font-semibold tracking-[0.08em]">
            {isDark ? t.nav.themeLight : t.nav.themeDark}
          </span>
        </button>
      </div>
    </aside>
  );
}
