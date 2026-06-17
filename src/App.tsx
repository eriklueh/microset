import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { useScheduler } from "@/hooks/useScheduler";
import { useT } from "@/lib/i18n";
import { setPanelVisible } from "@/lib/windows";
import { Titlebar } from "@/components/studio/Titlebar";
import { RelayBar } from "@/components/studio/hud";
import { Sidebar, type Section } from "@/components/studio/Sidebar";
import { CoachView } from "@/components/studio/CoachView";
import { TodayView } from "@/components/studio/TodayView";
import { RoutineView } from "@/components/studio/RoutineView";
import { EquipmentView } from "@/components/studio/EquipmentView";
import { ProgressView } from "@/components/studio/ProgressView";
import { SettingsView } from "@/components/studio/SettingsView";
import { UpdateBanner } from "@/components/studio/UpdateBanner";

function App() {
  const [section, setSection] = useState<Section>("today");
  const t = useT();
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
      <Titlebar label={t.nav[section]} />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={section} onSelect={setSection} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {section === "coach" && <CoachView onSettings={() => setSection("settings")} />}
          {section === "today" && <TodayView />}
          {section === "routine" && <RoutineView />}
          {section === "equipment" && <EquipmentView />}
          {section === "progress" && <ProgressView />}
          {section === "settings" && <SettingsView />}
        </main>
        <RelayBar />
      </div>
      <UpdateBanner />
    </div>
  );
}

export default App;
