import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/store/useStore";
import { TodayView } from "@/components/studio/TodayView";
import { RoutineView } from "@/components/studio/RoutineView";
import { EquipmentView } from "@/components/studio/EquipmentView";
import { SettingsView } from "@/components/studio/SettingsView";

function App() {
  const ensureToday = useStore((s) => s.ensureToday);

  useEffect(() => {
    ensureToday();
  }, [ensureToday]);

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">microset</h1>
        <p className="text-muted-foreground text-sm">coach de pausas activas</p>
      </header>

      <Tabs defaultValue="today" className="flex min-h-0 flex-1 flex-col gap-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today">Hoy</TabsTrigger>
          <TabsTrigger value="routine">Rutina</TabsTrigger>
          <TabsTrigger value="equipment">Equipo</TabsTrigger>
          <TabsTrigger value="settings">Ajustes</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto">
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
