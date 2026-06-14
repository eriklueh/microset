import {
  Activity,
  Boxes,
  CalendarDays,
  ListChecks,
  Moon,
  Settings,
  Sparkles,
  Sun,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "coach", label: "Coach", icon: Sparkles },
  { id: "today", label: "Hoy", icon: Activity },
  { id: "routine", label: "Rutina", icon: ListChecks },
  { id: "week", label: "Semana", icon: CalendarDays },
  { id: "equipment", label: "Equipo", icon: Boxes },
  { id: "progress", label: "Progreso", icon: TrendingUp },
];

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
    <aside className="bg-card/30 flex w-52 shrink-0 flex-col border-r p-3">
      <div className="flex items-center gap-2 px-2 py-2">
        <div className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-[11px] font-bold">
          m
        </div>
        <span className="text-sm font-semibold tracking-tight">microset</span>
      </div>

      <nav className="mt-3 flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={active === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5">
        <NavItem
          label="Ajustes"
          icon={Settings}
          active={active === "settings"}
          onClick={() => onSelect("settings")}
        />
        <button
          onClick={() => setThemeMode(isDark ? "light" : "dark")}
          className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Tema claro" : "Tema oscuro"}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
