# Fase B — Sync desktop ↔ Convex

> Diseño aprobado (2026-08-24). Cómo el estado del usuario se sincroniza entre dispositivos.
> Depende de Fase A (`convex/userDocs.ts` + tabla `userDocs`), ya construida.

## 1. Modelo

**Convex es el HUB / fuente de verdad del estado cross-device.** (Antes era "archivos mandan";
el requisito de un mobile futuro full-Convex —que escribe sin tener archivos— lo cambió.)

- **Mobile (futuro):** cliente Convex directo. Lee reactivo, escribe Convex. Sin capa de sync.
- **Desktop:** los JSON locales en `%APPDATA%/com.microset.app/` son la **caché de trabajo** +
  el **substrato del coach de Claude Code** (se editan igual que hoy). Una **capa de sync**
  los reconcilia contra Convex.
- **Coach remoto (MCP):** escribe Convex → el desktop lo baja a los archivos (watcher aplica),
  el mobile lo ve al instante.

Cada file-group del `FileGroup` registry (`routine`, `settings`, `entreno`, `equipment`,
`exercises`, `profile`) ↦ un documento `userDocs` del usuario. `logs` es aparte (ver §4).

## 2. Resolución de conflictos: LWW

- **Config = last-write-wins por documento.** Convex asigna `updatedAt` (server time) + `rev` al
  aceptar cada escritura. La granularidad es el file-group entero (reemplaza el doc completo).
- **Regla en conflicto** (ambos lados cambiaron desde el último sync): gana el de `updatedAt` más
  reciente — se compara el **mtime del archivo local** vs el **`updatedAt` (server) del remoto**.
  Caveat conocido: hay algo de clock-skew local-vs-servidor; para 1 usuario las colisiones reales
  son rarísimas → aceptable. (Mejora futura: timestamp de edición explícito, o merge por-campo.)
- Colisión sin cambio de un lado: no es conflicto (pull o push directo).

## 3. Algoritmo de reconciliación (por documento)

Estado de sync que el desktop persiste por group: `{ lastSyncedRev, lastSyncedHash }`.

```
reconcile(local, remote, sync):   // función PURA, testeable
  localChanged  = hash(local.data) !== sync.lastSyncedHash
  remoteChanged = remote.rev > sync.lastSyncedRev
  match:
    !localChanged && !remoteChanged            → NOOP
    !localChanged &&  remoteChanged            → PULL   (escribir remote.data al archivo)
     localChanged && !remoteChanged            → PUSH   (upsertMyDoc con baseRev=lastSyncedRev)
     localChanged &&  remoteChanged (CONFLICT) → LWW:
        local.mtime > remote.updatedAt  → PUSH  (local gana)
        else                            → PULL  (remote gana; el cambio local se pierde: avisar)
```

**Guard anti-eco (CRÍTICO):** al hacer PULL escribimos el archivo; el watcher va a disparar. Para
NO re-pushear nuestro propio pull: antes de escribir, seteamos `lastSyncedHash = hash(remote.data)`,
así cuando el watcher relee, `hash(local) === lastSyncedHash` ⇒ `localChanged=false` ⇒ NOOP.
Tras un PUSH exitoso: `lastSyncedRev = rev devuelto`, `lastSyncedHash = hash(local.data)`.

## 4. Logs = unión, NO LWW

Los logs (series hechas) son append-only y crecen; dos dispositivos loguean offline y hay que
**unir**, nunca sobrescribir. Sync por unión de eventos con id/at estable (cada `LogEntry` tiene
`at` único; usar `logEntryToEvent`/id determinista). Es **Fase B2**, aparte del config.

## 5. Superficie

- **Convex** (`convex/userDocs.ts`, ya existe): `getMyDocs` (reactivo), `upsertMyDoc({group,data,baseRev?})`
  → bumpea `rev`, setea `updatedAt = Date.now()` (server), devuelve `{rev, clobbered}` donde
  `clobbered = baseRev!=null && stored.rev!==baseRev` (telemetría; la resolución es LWW).
- **Desktop** (`src/store/sync/`): módulo puro `reconcile.ts` (+ tests) + `cloudSync.ts` (suscribe
  getMyDocs, lee/escribe archivos vía `files.ts`, ejecuta acciones, trackea `{lastSyncedRev,hash}`
  por group en un archivo de sync-state local). Corre solo si CLOUD_READY + signed-in + toggle ON.
- **Ajustes:** toggle **"Sincronizar entre dispositivos"** (opt-in, default OFF → local-first intacto).

## 6. Fases

- **B1** — sync de CONFIG (este doc, §1-3, §5): pure `reconcile` + Convex LWW + wiring desktop + toggle.
- **B2** — sync de LOGS (§4): unión de eventos.
- **B3** (futuro) — la app mobile (cliente Convex directo).
