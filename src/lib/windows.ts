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

/** Launch a Claude Code session as the coach. With `session`, resumes it
 * (claude --resume) in `cwd` (the session's own folder); else opens fresh in the
 * config workspace. */
export async function openCoach(session?: string, cwd?: string): Promise<void> {
  try {
    const args: Record<string, string> = {};
    if (session) args.session = session;
    if (cwd) args.cwd = cwd;
    await invoke("open_coach", args);
  } catch {
    // Not running inside Tauri — ignore.
  }
}

export interface CoachSession {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  cwd: string;
}

/** Read-only list of Claude Code sessions run in the config workspace. */
export async function listCoachSessions(): Promise<CoachSession[]> {
  try {
    return await invoke<CoachSession[]>("list_coach_sessions");
  } catch {
    return [];
  }
}
