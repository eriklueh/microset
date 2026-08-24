/**
 * SYNC Fase B1 · MOTOR de sync de CONFIG desktop ↔ Convex (docs/agent/sync.md §1-3, §5).
 *
 * Convex es el HUB cross-device; los JSON locales son su caché + el substrato del coach. Este
 * módulo suscribe `getMyDocs` (reactivo, vía convex/react), y por cada file-group de config
 * (SYNC_GROUPS de files.ts — todos menos logs) corre el reconciliador PURO `reconcile()` contra
 * el estado local serializado y el SyncState persistido, ejecutando PULL (aplica remote → store →
 * files.ts espeja el archivo) o PUSH (`upsertMyDoc` con baseRev).
 *
 * GATING (crítico): sólo se monta bajo CLOUD_READY (envs presentes) + <SignedIn> (Clerk) +
 * el toggle opt-in `syncEnabled` (DEFAULT OFF). Con el toggle apagado NADA de esto se monta →
 * la app shippeada es idéntica a hoy. La ventana panel/toast nunca renderiza <App/>, así que
 * este motor sólo vive en la ventana principal.
 *
 * El SyncState { lastSyncedRev, lastSyncedHash } por group se persiste en un archivo local
 * `sync-state.json` en el config dir — bookkeeping privado del desktop, NO un file-group que
 * se sincronice (files.ts lo ignora; no está en el REGISTRY).
 */

import { useEffect, useRef, type ReactElement } from "react";
import { useMutation, useQuery } from "convex/react";
import { SignedIn } from "@clerk/clerk-react";
import { appConfigDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile, stat, writeTextFile } from "@tauri-apps/plugin-fs";
import { api } from "../../../convex/_generated/api";
import { useStore } from "../useStore";
import { SYNC_GROUPS, applyCloudGroup } from "../files";
import {
  hashData,
  reconcile,
  syncStateAfterPull,
  syncStateAfterPush,
  type RemoteDoc,
  type SyncState,
} from "./reconcile";

/** True only when both cloud envs are present at build time (same gate as SocialView). */
const CLOUD_READY =
  !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && !!import.meta.env.VITE_CONVEX_URL;

/** A row as exposed by `api.userDocs.getMyDocs` (`data` is the opaque JSON string). */
type RemoteRow = { group: string; data: string; rev: number; updatedAt: number };
type UpsertFn = (args: {
  group: string;
  data: string;
  baseRev: number;
}) => Promise<{ rev: number; clobbered: boolean }>;

// ── module-level engine (singleton; only the main window ever mounts the hook) ───────────
const SYNC_STATE_FILE = "sync-state.json";
const DEBOUNCE_MS = 500;

let dir = "";
let syncState: Record<string, SyncState> = {};
let stateLoaded = false;
let getRemote: (() => RemoteRow[] | undefined) | null = null;
let upsert: UpsertFn | null = null;
let unsubStore: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let queued = false;

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null; // a malformed remote doc must not crash a pass
  }
}

/** Load the persisted per-group SyncState once (empty on first ever run). */
async function ensureLoaded(): Promise<void> {
  if (stateLoaded) return;
  try {
    const path = await join(dir, SYNC_STATE_FILE);
    if (await exists(path)) {
      const parsed = safeParse(await readTextFile(path));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        syncState = parsed as Record<string, SyncState>;
      }
    }
  } catch {
    // fresh / unreadable → start empty (every group is "never synced")
  }
  stateLoaded = true;
}

async function persistState(): Promise<void> {
  try {
    await writeTextFile(await join(dir, SYNC_STATE_FILE), JSON.stringify(syncState, null, 2));
  } catch {
    // best-effort; a failed write just means the next boot re-syncs from scratch
  }
}

/** mtime (epoch ms) of a group's file — the local side of the LWW tiebreak (sync.md §2). */
async function fileMtime(name: string): Promise<number> {
  try {
    const info = await stat(await join(dir, name));
    return info.mtime ? info.mtime.getTime() : Date.now();
  } catch {
    return Date.now(); // missing/unreadable → treat as just-now (local wins a conflict)
  }
}

/** One full reconciliation sweep over every config group. */
async function onePass(remote: RemoteRow[]): Promise<void> {
  await ensureLoaded();
  const state = useStore.getState();
  const byGroup = new Map(remote.map((r) => [r.group, r] as const));

  for (const g of SYNC_GROUPS) {
    const ss = syncState[g.name] ?? { lastSyncedRev: 0, lastSyncedHash: "" };
    const localData = g.select(state);
    const row = byGroup.get(g.name);
    const rd: RemoteDoc | null = row
      ? { data: safeParse(row.data), rev: row.rev, updatedAt: row.updatedAt }
      : null;

    // FIRST CONTACT: this device never synced this group but the cloud already holds it.
    // Adopt the cloud doc directly instead of letting LWW clobber real remote data with this
    // device's local defaults (a fresh install joining an existing account). Not part of the
    // pure reconciler (kept LWW + tested); it's a wiring-level seeding policy.
    const neverSynced = ss.lastSyncedRev === 0 && ss.lastSyncedHash === "";
    if (neverSynced && rd && rd.rev > 0) {
      syncState[g.name] = syncStateAfterPull(rd); // anti-eco: fija el hash ANTES de aplicar
      await persistState();
      if (hashData(localData) !== hashData(rd.data)) {
        console.warn(
          `[cloudSync] primer sync de ${g.name}: se adoptó la nube (se descartó el estado local de este dispositivo).`,
        );
      }
      applyCloudGroup(g.name, rd.data);
      continue;
    }

    const mtime = await fileMtime(g.name);
    const action = reconcile(g.name, { data: localData, mtime }, rd, ss);

    if (action.kind === "noop") continue;

    if (action.kind === "pull") {
      // Guard anti-eco (sync.md §3): fijar el SyncState ANTES de aplicar, para que cuando el
      // store cambie (→ files.ts escribe el archivo → dispara otra pasada) reconcile vea
      // localChanged=false ⇒ NOOP y no re-pushee su propio pull.
      syncState[g.name] = action.nextSync;
      await persistState();
      applyCloudGroup(g.name, action.data);
      if (action.lostLocal) {
        console.warn(
          `[cloudSync] conflicto en ${g.name}: ganó la nube por timestamp; se descartó un cambio local.`,
        );
      }
    } else {
      const res = await upsert!({
        group: g.name,
        data: JSON.stringify(action.data),
        baseRev: action.baseRev,
      });
      syncState[g.name] = syncStateAfterPush(action.data, res.rev);
      await persistState();
    }
  }
}

/** Run a sweep with a mutex; if a trigger arrives mid-sweep, run exactly one more. */
async function runPass(): Promise<void> {
  if (!getRemote || !upsert) return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    do {
      queued = false;
      const remote = getRemote();
      if (remote === undefined) break; // Convex query still loading — a later trigger re-runs
      await onePass(remote);
    } while (queued);
  } catch (e) {
    console.warn("[cloudSync] pasada falló", e);
  } finally {
    running = false;
  }
}

/** Debounced trigger — batches bursts of store/remote changes into one sweep. */
function scheduleSync(): void {
  if (!getRemote || !upsert) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void runPass(), DEBOUNCE_MS);
}

async function enableCloudSync(): Promise<void> {
  if (!dir) {
    try {
      dir = await appConfigDir();
    } catch {
      return; // not running under Tauri (no fs) — nothing to sync against
    }
  }
  await ensureLoaded();
  if (!unsubStore) {
    // Any local store change (user edit or a coach file edit picked up by files.ts) → resync.
    unsubStore = useStore.subscribe(() => scheduleSync());
  }
  scheduleSync();
}

function disableCloudSync(): void {
  if (unsubStore) {
    unsubStore();
    unsubStore = null;
  }
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * The engine hook. Lives under <SignedIn> so the Convex hooks resolve with a verified identity
 * (getMyDocs/upsertMyDoc require it). Keeps the latest query result + mutation in refs and
 * re-runs a sweep whenever the remote docs change.
 */
function useCloudSyncEngine(): void {
  const remote = useQuery(api.userDocs.getMyDocs);
  const upsertMut = useMutation(api.userDocs.upsertMyDoc);

  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const upsertRef = useRef(upsertMut);
  upsertRef.current = upsertMut;

  useEffect(() => {
    getRemote = () => remoteRef.current as RemoteRow[] | undefined;
    upsert = (args) => upsertRef.current(args);
    void enableCloudSync();
    return () => {
      disableCloudSync();
      getRemote = null;
      upsert = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (remote !== undefined) scheduleSync();
  }, [remote]);
}

function CloudSyncRunner(): null {
  useCloudSyncEngine();
  return null;
}

/**
 * Mount point for the cloud-sync engine. Rendered unconditionally by <App/>, but it self-gates:
 *  - !CLOUD_READY  → returns null before ANY Clerk/Convex hook (safe in the bare, provider-less
 *                    tree that main.tsx renders when the envs are missing).
 *  - syncEnabled OFF (the default) → returns null, so nothing mounts and the app is identical.
 *  - otherwise → runs the engine only while <SignedIn>.
 */
export function CloudSync(): ReactElement | null {
  if (!CLOUD_READY) return null;
  return <CloudSyncGate />;
}

function CloudSyncGate(): ReactElement | null {
  const syncEnabled = useStore((s) => s.syncEnabled);
  if (!syncEnabled) return null;
  return (
    <SignedIn>
      <CloudSyncRunner />
    </SignedIn>
  );
}
