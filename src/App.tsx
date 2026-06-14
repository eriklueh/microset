import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { useScheduler } from "@/hooks/useScheduler";
import { resolveDark } from "@/lib/theme";
import { TodayView } from "@/components/studio/TodayView";
import { RoutineView } from "@/components/studio/RoutineView";
import { EquipmentView } from "@/components/studio/EquipmentView";
import { SettingsView } from "@/components/studio/SettingsView";

function App() {
  const ensureToday = useStore((s) => s.ensureToday);
  const theme = useStore((s) => s.theme);
  const setThemeMode = useStore((s) => s.setThemeMode);

  useEffect(() => {
    ensureToday();
  }, [ensureToday]);
  useScheduler();

  const isDark = resolveDark(theme.mode);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-[11px] font-bold">
            m
          </div>
          <span className="text-sm font-semibold tracking-tight">microset</span>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Cambiar tema"
          onClick={() => setThemeMode(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </header>

      <Tabs
        defaultValue="today"
        className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-5"
      >
        <TabsList className="bg-muted/50 grid w-full grid-cols-4">
          <TabsTrigger value="today">Hoy</TabsTrigger>
          <TabsTrigger value="routine">Rutina</TabsTrigger>
          <TabsTrigger value="equipment">Equipo</TabsTrigger>
          <TabsTrigger value="settings">Ajustes</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="today">
            <TodayView />
          </TabsContent>
          <TabsContent value="routine">
            <RoutineView />
          </TabsContent>
          <TabsContent value="equipment">
            <EquipmentView />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsView />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default App;
