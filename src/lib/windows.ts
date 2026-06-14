import { Window } from "@tauri-apps/api/window";

/** Show or hide the floating panel window (no-op outside Tauri). */
export async function setPanelVisible(visible: boolean): Promise<void> {
  try {
    const panel = await Window.getByLabel("panel");
    if (!panel) return;
    if (visible) {
      await panel.show();
    } else {
      await panel.hide();
    }
  } catch {
    // Not running inside Tauri — ignore.
  }
}
