import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { useScheduler } from "@/hooks/useScheduler";
import { setPanelVisible } from "@/lib/windows";
import { Sidebar, type Section } from "@/components/studio/Sidebar";
import { CoachView } from "@/components/studio/CoachView";
import { TodayView } from "@/components/studio/TodayView";
import { RoutineView } from "@/components/studio/RoutineView";
import { EquipmentView } from "@/components/studio/EquipmentView";
import { ProgressView } from "@/components/studio/ProgressView";
import { SettingsView } from "@/components/studio/SettingsView";

const HEADINGS: Record<Section, { title: string; subtitle: string }> = {
  coach: { title: "Coach", subtitle: "Tu entrenador inteligente" },
  today: { title: "Hoy", subtitle: "Tu día, repartido en pausas" },
  routine: { title: "Rutina", subtitle: "Qué entrenás cada día" },
  equipment: { title: "Equipo", subtitle: "Lo que tenés en casa" },
  progress: { title: "Progreso", subtitle: "Tu evolución por ejercicio" },
  settings: { title: "Ajustes", subtitle: "Preferencias de microset" },
};

function App() {
  const [section, setSection] = useState<Section>("coach");
  const ensureToday = useStore((s) => s.ensureToday);
  const panelEnabled = useStore((s) => s.panelEnabled);

  useEffect(() => {
    ensureToday();
  }, [ensureToday]);

  // Apply the panel visibility preference once on startup.
  useEffect(() => {
    void setPanelVisible(panelEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useScheduler();

  const heading = HEADINGS[section];

  return (
    <div className="bg-background/90 flex h-screen">
      <Sidebar active={section} onSelect={setSection} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="px-6 pt-5 pb-4">
          <h1 className="text-lg font-semibold tracking-tight">{heading.title}</h1>
          <p className="text-muted-foreground text-xs">{heading.subtitle}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {section === "coach" && <CoachView onStart={() => setSection("today")} />}
          {section === "today" && <TodayView />}
          {section === "routine" && <RoutineView />}
          {section === "equipment" && <EquipmentView />}
          {section === "progress" && <ProgressView />}
          {section === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}

export default App;
