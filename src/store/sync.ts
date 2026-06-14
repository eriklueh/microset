import { emit, listen } from "@tauri-apps/api/event";
import { applyTheme } from "@/lib/theme";
import { useStore } from "./useStore";

const SYNC_EVENT = "microset://sync";

// Guards against re-broadcasting a change that came from another window.
let suppress = false;

/**
 * Keep the store in sync across the main and panel windows. Any mutation
 * persists to localStorage (via zustand persist) and emits a sync ping; every
 * window rehydrates from storage when it receives the ping. Call once per window.
 */
export function setupCrossWindowSync(): void {
  useStore.subscribe(() => {
    if (suppress) return;
    void emit(SYNC_EVENT);
  });

  void listen(SYNC_EVENT, async () => {
    suppress = true;
    try {
      await useStore.persist.rehydrate();
      // Re-apply the theme: rehydrate restores the store data but not the
      // imperative `.dark`/accent classes, so panel + toast follow theme changes.
      const { mode, accent } = useStore.getState().theme;
      applyTheme(mode, accent);
    } finally {
      suppress = false;
    }
  });
}
