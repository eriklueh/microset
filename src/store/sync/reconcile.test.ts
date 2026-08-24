import { describe, it, expect } from "vitest";
import {
  hashData,
  reconcile,
  syncStateAfterPull,
  syncStateAfterPush,
  type LocalDoc,
  type RemoteDoc,
  type SyncState,
} from "./reconcile";

/**
 * SYNC Fase B1 · el reconciliador puro (docs/agent/sync.md §3).
 * Timestamps fijos, sin Date.now: todo determinista. Cubre noop, pull, push, los dos lados
 * del conflicto LWW, y el guard anti-eco (tras pull/push, un re-reconcile ⇒ noop).
 */

const GROUP = "settings.json";

// Contenidos de ejemplo (el `data` ya parseado del file-group).
const A = { snoozeMinutes: 30, theme: { mode: "dark" } };
const B = { snoozeMinutes: 45, theme: { mode: "light" } };

const HASH_A = hashData(A);
const HASH_B = hashData(B);

/** SyncState en reposo: local == remoto, ambos = A al rev dado. */
function syncedAt(rev: number, hash = HASH_A): SyncState {
  return { lastSyncedRev: rev, lastSyncedHash: hash };
}

describe("hashData", () => {
  it("es determinista e independiente del orden de claves", () => {
    expect(hashData({ a: 1, b: 2 })).toBe(hashData({ b: 2, a: 1 }));
    expect(hashData(A)).toBe(hashData({ theme: { mode: "dark" }, snoozeMinutes: 30 }));
  });

  it("distingue contenidos distintos", () => {
    expect(HASH_A).not.toBe(HASH_B);
  });

  it("normaliza undefined a null y no explota con primitivos/arrays", () => {
    expect(hashData(undefined)).toBe(hashData(null));
    expect(hashData([1, 2, 3])).toBe(hashData([1, 2, 3]));
    expect(hashData([1, 2, 3])).not.toBe(hashData([3, 2, 1]));
  });
});

describe("reconcile · sin conflicto", () => {
  it("NOOP: ni local ni remoto cambiaron", () => {
    const local: LocalDoc = { data: A, mtime: 1000 };
    const remote: RemoteDoc = { data: A, rev: 5, updatedAt: 900 };
    const action = reconcile(GROUP, local, remote, syncedAt(5));
    expect(action).toEqual({ kind: "noop", group: GROUP });
  });

  it("PULL: solo el remoto cambió (rev subió), local intacto", () => {
    const local: LocalDoc = { data: A, mtime: 1000 };
    const remote: RemoteDoc = { data: B, rev: 6, updatedAt: 2000 };
    const action = reconcile(GROUP, local, remote, syncedAt(5));
    expect(action).toEqual({
      kind: "pull",
      group: GROUP,
      data: B,
      nextSync: { lastSyncedRev: 6, lastSyncedHash: HASH_B },
      lostLocal: false,
    });
  });

  it("PUSH: solo el local cambió, remoto igual — baseRev = lastSyncedRev", () => {
    const local: LocalDoc = { data: B, mtime: 3000 };
    const remote: RemoteDoc = { data: A, rev: 5, updatedAt: 900 };
    const action = reconcile(GROUP, local, remote, syncedAt(5));
    expect(action).toEqual({ kind: "push", group: GROUP, data: B, baseRev: 5 });
  });

  it("PUSH: primer sync — no hay remoto todavía (remote=null)", () => {
    const local: LocalDoc = { data: B, mtime: 3000 };
    // Nunca sincronizado: rev 0, hash de un doc distinto (o vacío) ⇒ localChanged.
    const sync: SyncState = { lastSyncedRev: 0, lastSyncedHash: hashData({}) };
    const action = reconcile(GROUP, local, null, sync);
    expect(action).toEqual({ kind: "push", group: GROUP, data: B, baseRev: 0 });
  });

  it("NOOP: sin remoto y sin cambio local", () => {
    const local: LocalDoc = { data: A, mtime: 1000 };
    const action = reconcile(GROUP, local, null, syncedAt(0));
    expect(action).toEqual({ kind: "noop", group: GROUP });
  });
});

describe("reconcile · conflicto (ambos cambiaron) → LWW", () => {
  // sync base al rev 5 con hash A; local editó a B (localChanged), remoto avanzó a rev 6 con
  // su propio contenido (remoteChanged). Gana quien tiene el timestamp más nuevo.
  const local: LocalDoc = { data: B, mtime: 5000 };

  it("local gana: mtime local > updatedAt remoto ⇒ PUSH", () => {
    const remote: RemoteDoc = { data: { snoozeMinutes: 99 }, rev: 6, updatedAt: 4000 };
    const action = reconcile(GROUP, local, remote, syncedAt(5));
    expect(action).toEqual({ kind: "push", group: GROUP, data: B, baseRev: 5 });
  });

  it("remoto gana: mtime local < updatedAt remoto ⇒ PULL con lostLocal", () => {
    const remoteData = { snoozeMinutes: 99 };
    const remote: RemoteDoc = { data: remoteData, rev: 6, updatedAt: 9000 };
    const action = reconcile(GROUP, local, remote, syncedAt(5));
    expect(action).toEqual({
      kind: "pull",
      group: GROUP,
      data: remoteData,
      nextSync: { lastSyncedRev: 6, lastSyncedHash: hashData(remoteData) },
      lostLocal: true,
    });
  });

  it("empate de timestamps: gana el remoto (regla `>` estricta) ⇒ PULL", () => {
    const remoteData = { snoozeMinutes: 99 };
    const remote: RemoteDoc = { data: remoteData, rev: 6, updatedAt: 5000 };
    const action = reconcile(GROUP, local, remote, syncedAt(5));
    expect(action.kind).toBe("pull");
    expect((action as { lostLocal: boolean }).lostLocal).toBe(true);
  });
});

describe("guard anti-eco", () => {
  it("tras un PULL, adoptar nextSync ⇒ el mismo data local reconcilia a NOOP", () => {
    // 1) Reconcile inicial: remoto avanzó → PULL de B.
    const remote: RemoteDoc = { data: B, rev: 6, updatedAt: 2000 };
    const first = reconcile(GROUP, { data: A, mtime: 1000 }, remote, syncedAt(5));
    expect(first.kind).toBe("pull");
    const nextSync = (first as { nextSync: SyncState }).nextSync;

    // 2) El executor escribió B al archivo; el watcher relee → local.data ahora es B.
    //    Con el nextSync del pull, NO debe re-pushear su propio pull.
    const echo = reconcile(GROUP, { data: B, mtime: 2500 }, remote, nextSync);
    expect(echo).toEqual({ kind: "noop", group: GROUP });
  });

  it("tras un PUSH, adoptar syncStateAfterPush ⇒ re-reconcile es NOOP", () => {
    // 1) Cambio local → PUSH.
    const remote: RemoteDoc = { data: A, rev: 5, updatedAt: 900 };
    const push = reconcile(GROUP, { data: B, mtime: 3000 }, remote, syncedAt(5));
    expect(push).toEqual({ kind: "push", group: GROUP, data: B, baseRev: 5 });

    // 2) El server aceptó y devolvió rev 6. Adoptamos el nuevo SyncState y el remoto ahora
    //    refleja B@6 (lo que acabamos de subir) → nada más que hacer.
    const afterPush = syncStateAfterPush(B, 6);
    const remoteNow: RemoteDoc = { data: B, rev: 6, updatedAt: 3100 };
    const echo = reconcile(GROUP, { data: B, mtime: 3000 }, remoteNow, afterPush);
    expect(echo).toEqual({ kind: "noop", group: GROUP });
  });

  it("syncStateAfterPull refleja rev y hash del remoto", () => {
    const remote: RemoteDoc = { data: B, rev: 7, updatedAt: 8000 };
    expect(syncStateAfterPull(remote)).toEqual({ lastSyncedRev: 7, lastSyncedHash: HASH_B });
  });
});
