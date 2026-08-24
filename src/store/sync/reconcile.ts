/**
 * SYNC Fase B1 · núcleo PURO de reconciliación de CONFIG (LWW por documento).
 *
 * Sin Tauri, sin React, sin zustand, sin `crypto` de Node: todo acá corre en cualquier
 * runtime (el store del desktop, un test, un futuro cliente). Implementa el algoritmo de
 * docs/agent/sync.md §3. La capa de wiring (cloudSync.ts, aparte) suscribe getMyDocs, lee/
 * escribe archivos vía files.ts y EJECUTA las acciones que devuelve `reconcile`.
 *
 * Contrato de `data`: acá `data` es el objeto YA parseado del file-group (no el string
 * opaco que viaja a Convex). El wiring hace JSON.parse(remote.data) antes de reconciliar y
 * JSON.stringify(action.data) antes de pushear, de modo que local y remoto se hashean igual.
 */

/** Estado de sync que el desktop persiste por group (substrato del guard anti-eco). */
export interface SyncState {
  /** Último `rev` remoto que integramos (0 = nunca sincronizado con el server). */
  lastSyncedRev: number;
  /** hash del `data` en el último punto de sync — detecta cambios locales sin server. */
  lastSyncedHash: string;
}

/** El documento local: la caché de archivos del desktop. */
export interface LocalDoc {
  /** El objeto del file-group ya parseado desde el archivo. */
  data: unknown;
  /** mtime del archivo local, epoch ms — el lado local del desempate LWW. */
  mtime: number;
}

/** El documento remoto tal como lo expone getMyDocs (con `data` ya parseado por el wiring). */
export interface RemoteDoc {
  /** El objeto del file-group ya parseado desde el string opaco de Convex. */
  data: unknown;
  /** Contador monotónico asignado por el server. */
  rev: number;
  /** Server time (epoch ms) de la última escritura — el lado remoto del desempate LWW. */
  updatedAt: number;
}

/**
 * La acción que el executor debe aplicar. Cada variante lleva su `group`.
 *  - noop: nada que hacer.
 *  - pull: escribir `data` al archivo y adoptar `nextSync` (ya computado). `lostLocal` marca
 *          el caso de CONFLICTO en que el remoto ganó y se descarta un cambio local (avisar).
 *  - push: subir `data` con `upsertMyDoc({ group, data, baseRev })`; con el `rev` devuelto,
 *          computar el nuevo SyncState con `syncStateAfterPush(data, rev)`.
 */
export type SyncAction =
  | { kind: "noop"; group: string }
  | { kind: "pull"; group: string; data: unknown; nextSync: SyncState; lostLocal: boolean }
  | { kind: "push"; group: string; data: unknown; baseRev: number };

// ---------------------------------------------------------------------------
// Hash de contenido: PURO y determinista, estable ante orden de claves.
// ---------------------------------------------------------------------------

/** Serialización canónica: claves de objeto ordenadas → mismo string para el mismo contenido. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // undefined/NaN/Infinity → JSON.stringify da undefined; los normalizamos a "null".
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

/** FNV-1a de 32 bits (con `Math.imul` para wrap-around exacto). Puro, sin dependencias. */
function fnv1a(str: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hash estable del `data` de un doc. Dos pasadas FNV-1a con basis distinto → 64 bits en hex,
 * suficiente para el guard anti-eco de config (un usuario, pocos groups). No es criptográfico.
 */
export function hashData(data: unknown): string {
  const s = canonical(data);
  const a = fnv1a(s, 0x811c9dc5);
  const b = fnv1a(s, 0x811c9dc5 ^ 0x9e3779b9);
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Guard anti-eco: cómo queda el SyncState tras cada acción.
// ---------------------------------------------------------------------------

/**
 * Tras un PULL: adoptamos el rev remoto y fijamos el hash al del `data` remoto ANTES de
 * escribir el archivo. Así, cuando el watcher relea el archivo recién escrito,
 * hash(local) === lastSyncedHash ⇒ localChanged=false ⇒ NOOP (no re-pusheamos el pull).
 */
export function syncStateAfterPull(remote: RemoteDoc): SyncState {
  return { lastSyncedRev: remote.rev, lastSyncedHash: hashData(remote.data) };
}

/**
 * Tras un PUSH exitoso: adoptamos el `rev` que devolvió el server y fijamos el hash al del
 * `data` local recién subido ⇒ localChanged=false hasta la próxima edición local.
 */
export function syncStateAfterPush(localData: unknown, rev: number): SyncState {
  return { lastSyncedRev: rev, lastSyncedHash: hashData(localData) };
}

// ---------------------------------------------------------------------------
// El reconciliador (docs/agent/sync.md §3).
// ---------------------------------------------------------------------------

/**
 * Decide la acción para un file-group comparando la caché local, el remoto (o null si aún no
 * existe en el server) y el SyncState persistido. PURA: no toca archivos ni la red.
 *
 *   localChanged  = hash(local.data) !== sync.lastSyncedHash
 *   remoteChanged = (remote?.rev ?? 0) > sync.lastSyncedRev
 *   noop  : !localChanged && !remoteChanged
 *   pull  : !localChanged &&  remoteChanged
 *   push  :  localChanged && !remoteChanged   (baseRev = lastSyncedRev)
 *   conflicto (ambos): LWW por timestamp — local.mtime > remote.updatedAt ⇒ push (local gana),
 *             si no ⇒ pull con lostLocal=true (remoto gana, se pierde el cambio local: avisar).
 */
export function reconcile(
  group: string,
  local: LocalDoc,
  remote: RemoteDoc | null,
  sync: SyncState,
): SyncAction {
  const localChanged = hashData(local.data) !== sync.lastSyncedHash;
  const remoteRev = remote?.rev ?? 0;
  const remoteChanged = remoteRev > sync.lastSyncedRev;

  if (!remoteChanged) {
    // Sin cambio remoto: o no pasa nada, o subimos el cambio local.
    if (!localChanged) return { kind: "noop", group };
    return { kind: "push", group, data: local.data, baseRev: sync.lastSyncedRev };
  }

  // remoteChanged ⇒ remote es no-null (remoteRev>sync.lastSyncedRev≥0 exige un remoto real).
  // El guard explícito satisface al type-checker sin usar `!`.
  if (!remote) return { kind: "noop", group };

  if (!localChanged) {
    // Pull directo: nadie tocó local desde el último sync.
    return { kind: "pull", group, data: remote.data, nextSync: syncStateAfterPull(remote), lostLocal: false };
  }

  // Conflicto: ambos lados cambiaron desde el último sync → desempate LWW por timestamp.
  if (local.mtime > remote.updatedAt) {
    // Local es más nuevo → gana local: push (baseRev señala que sabíamos que el remoto cambió).
    return { kind: "push", group, data: local.data, baseRev: sync.lastSyncedRev };
  }
  // Empate o remoto más nuevo → gana remoto: pull y se descarta el cambio local.
  return { kind: "pull", group, data: remote.data, nextSync: syncStateAfterPull(remote), lostLocal: true };
}
