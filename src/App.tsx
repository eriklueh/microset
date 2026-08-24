import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { useScheduler } from "@/hooks/useScheduler";
import { useT } from "@/lib/i18n";
import { setPanelVisible } from "@/lib/windows";
import { Titlebar } from "@/components/studio/Titlebar";
import { BootSplash } from "@/components/studio/BootSplash";
import { RelayBar } from "@/components/studio/hud";
import { Sidebar, type Section } from "@/components/studio/Sidebar";
import { CoachView } from "@/components/studio/CoachView";
import { TodayView } from "@/components/studio/TodayView";
import { CalendarView } from "@/components/studio/CalendarView";
import { RoutineView } from "@/components/studio/RoutineView";
import { EquipmentView } from "@/components/studio/EquipmentView";
import { ProgressView } from "@/components/studio/ProgressView";
import { SocialView } from "@/components/studio/SocialView";
import { SettingsView } from "@/components/studio/SettingsView";
import { UpdateBanner } from "@/components/studio/UpdateBanner";
import { CloudSync } from "@/store/sync/cloudSync";

function App() {
  const [section, setSection] = useState<Section>("today");
  const t = useT();
  const ensureToday = useStore((s) => s.ensureToday);
  const panelEnabled = useStore((s) => s.panelEnabled);
  const socialOn = useStore((s) => !!s.modules.social?.enabled);

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
      <BootSplash />
      <Titlebar label={t.nav[section]} />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={section} onSelect={setSection} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {section === "coach" && <CoachView onSettings={() => setSection("settings")} />}
          {section === "today" && <TodayView />}
          {section === "calendar" && <CalendarView />}
          {section === "routine" && <RoutineView />}
          {section === "equipment" && <EquipmentView />}
          {section === "progress" && <ProgressView />}
          {section === "social" && socialOn && <SocialView />}
          {section === "settings" && <SettingsView />}
        </main>
        <RelayBar />
      </div>
      <UpdateBanner />
      {/* Cross-device CONFIG sync (Fase B1). Self-gates: renders nothing unless CLOUD_READY +
          signed-in + the opt-in toggle is ON, so with sync off the app is unchanged. */}
      <CloudSync />
    </div>
  );
}

export default App;
