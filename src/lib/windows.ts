import { invoke } from "@tauri-apps/api/core";
import { appConfigDir } from "@tauri-apps/api/path";
import { Window } from "@tauri-apps/api/window";
import { openPath } from "@tauri-apps/plugin-opener";

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

/** Position (bottom-right) and show the toast reminder window. Positioning is
 * done in Rust so it works without per-window placement permissions. */
export async function openToastWindow(): Promise<void> {
  try {
    await invoke("show_toast");
  } catch {
    // Not running inside Tauri — ignore.
  }
}

/** Hide the toast reminder window. */
export async function closeToastWindow(): Promise<void> {
  try {
    await invoke("hide_toast");
  } catch {
    // Not running inside Tauri — ignore.
  }
}

/** Open the OS config folder (where the editable JSON config lives). */
export async function openConfigFolder(): Promise<void> {
  try {
    await openPath(await appConfigDir());
  } catch {
    // Not running inside Tauri — ignore.
  }
}

/** Launch a Claude Code session as the coach, in the config workspace. */
export async function openCoach(): Promise<void> {
  try {
    await invoke("open_coach");
  } catch {
    // Not running inside Tauri — ignore.
  }
}
