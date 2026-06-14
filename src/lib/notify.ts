import {
  isPermissionGranted,
  onAction,
  registerActionTypes,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Block } from "@/lib/engine";
import { exerciseById } from "@/domain/seed";

const ACTION_TYPE = "microset-set";

let counter = 1;
/** Maps a fired notification id back to its block, so actions can be applied. */
const notifToBlock = new Map<number, string>();

/** Ask for permission (once) and register the notification's action buttons. */
export async function ensureNotificationSetup(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (!granted) return false;

  try {
    await registerActionTypes([
      {
        id: ACTION_TYPE,
        actions: [
          { id: "done", title: "Hecho" },
          { id: "snooze", title: "Posponer 30'" },
          { id: "decline", title: "Ahora no" },
        ],
      },
    ]);
  } catch {
    // Action buttons aren't supported on every platform — notifications still fire.
  }
  return true;
}

/** Fire a native notification for a due block. */
export function notifyBlock(block: Block): void {
  const ex = exerciseById(block.exerciseId);
  const suffix = ex?.defaultReps ? ` · ${ex.defaultReps}` : "";
  const id = counter++;
  notifToBlock.set(id, block.id);
  sendNotification({
    id,
    title: "microset · toca una serie 💪",
    body: `${block.name}${suffix}`,
    actionTypeId: ACTION_TYPE,
  });
}

/** Wire the notification action buttons to the engine actions. Call once. */
export async function listenForNotificationActions(handlers: {
  done: (blockId: string) => void;
  snooze: (blockId: string) => void;
  decline: (blockId: string) => void;
}): Promise<void> {
  try {
    // The payload shape varies across plugin versions/platforms, so read it loosely.
    await onAction((payload: any) => {
      const notifId: number | undefined = payload?.id;
      const actionId: string | undefined = payload?.actionId ?? payload?.action;
      const blockId = notifId != null ? notifToBlock.get(notifId) : undefined;
      if (!blockId || !actionId) return;
      if (actionId === "done") handlers.done(blockId);
      else if (actionId === "snooze") handlers.snooze(blockId);
      else if (actionId === "decline") handlers.decline(blockId);
      if (notifId != null) notifToBlock.delete(notifId);
    });
  } catch {
    // onAction unsupported here — the in-app "Hoy" card remains the way to answer.
  }
}
