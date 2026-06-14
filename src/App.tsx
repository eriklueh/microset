import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { useScheduler } from "@/hooks/useScheduler";
import { setPanelVisible } from "@/lib/windows";
import { Titlebar } from "@/components/studio/Titlebar";
import { Sidebar, type Section } from "@/components/studio/Sidebar";
import { CoachView } from "@/components/studio/CoachView";
import { TodayView } from "@/components/studio/TodayView";
import { RoutineView } from "@/components/studio/RoutineView";
import { SemanaView } from "@/components/studio/SemanaView";
import { EquipmentView } from "@/components/studio/EquipmentView";
import { ProgressView } from "@/components/studio/ProgressView";
import { SettingsView } from "@/components/studio/SettingsView";

function App() {
  const [section, setSection] = useState<Section>("today");
  const ensureToday = useStore((s) => s.ensureToday);
  const panelEnabled = useStore((s) => s.panelEnabled);

  useEffect(() => {
    ensureToday();
  }, [ensureToday]);

  useEffect(() => {
    void setPanelVisible(panelEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useScheduler();

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={section} onSelect={setSection} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {section === "coach" && <CoachView onSettings={() => setSection("settings")} />}
          {section === "today" && <TodayView />}
          {section === "routine" && <RoutineView />}
          {section === "week" && <SemanaView />}
          {section === "equipment" && <EquipmentView />}
          {section === "progress" && <ProgressView />}
          {section === "settings" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}

export default App;
