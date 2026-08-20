# BASE — Visión y arquitectura de la plataforma

> Documento vivo. Es el **norte** del producto y la arquitectura que lo sostiene. El plan
> incremental de features vive en [BACKLOG.md](BACKLOG.md); el contrato del coach en
> [agent/coach.md](agent/coach.md). Cuando algo de acá se implemente, promoverlo al backlog.

## 1. Norte

**BASE** es una **app de escritorio local-first que funciona como un "sistema operativo" de cuerpo
y hábitos.** Un **kernel de datos compartido** (identidad, un log de actividad append-only,
catálogos, perfil/objetivos/medidas, calendario y el registro de módulos) con **módulos**
verticales que el usuario prende a gusto, y **capas** horizontales que no persisten nada: solo
derivan sobre el log.

- Con `modules = {pausa}` es **exactamente la app de hoy** (microset). Nada cambia para ese usuario.
- Crece a plataforma **sin rewrite**, porque cada módulo nuevo son los **cuatro patrones que
  microset ya tiene**, promovidos a contratos alrededor del kernel:
  1. engine puro day-bounded (`src/lib/engine`),
  2. store zustand-persist espejado a JSON editable (`src/store/files.ts`),
  3. coach-tools = acciones del store (`src/coach/tools.ts`),
  4. proyecciones puras sobre el log (`src/lib/levels.ts`).
- **`microset` sigue siendo el nombre público del módulo Pausa** (protege landing + assets de
  release + updater). **BASE** es la plataforma madre (y el nombre interno del kernel).

## 2. Principios

- **Local-first, siempre.** La app corre 100% offline, en solo, sin cuenta, con `{pausa}`.
- **Modular y opt-in.** Prender un módulo es puramente aditivo; apagarlo **oculta** la UI y para
  sus schedulers, pero **no borra un byte** (re-prender restaura todo). Generaliza el flag
  `levelsEnabled` ya existente.
- **Privacidad por diseño.** Ningún dato crudo sale del dispositivo sin opt-in explícito.
- **Mobile-ready (preparar, no construir).** Toda la lógica de kernel + módulos vive en **TS
  portable** — nada de dominio atado a Rust/Tauri. Solo el widget de Pausa (tray/panel/toast) es
  desktop. Un cliente web/mobile futuro reusa kernel + módulos sobre el mismo backend (Convex).
- **Los módulos nunca se importan entre sí.** Se hablan solo a través del kernel.

## 3. Arquitectura — cuatro capas (cada una importa solo hacia abajo)

```
┌─ SHELL ────────────────────────────────────────────────────────┐
│  UI Manifiesto manejada por el registro. Home/CONSOLA que        │
│  compone los módulos activos. Pausa conserva tray+panel+toast.   │
├─ CAPAS (horizontales, puras, no persisten) ─────────────────────┤
│  Gamificación · Social/Amigos · Coach IA (multi-dominio)         │
│  Leen SOLO el sobre de métricas del log, nunca el payload.       │
├─ MÓDULOS (verticales, tienen schedule + datos propios) ─────────┤
│  Pausa · Entreno · Nutrición   (opt-in, decoplados)              │
├─ KERNEL (plano de datos + 2 contratos) ─────────────────────────┤
│  identidad/hogar · log de ActivityEvent · catálogos · perfil/    │
│  objetivos/medidas · calendario · registro de módulos · engine.  │
└──────────────────────────────────────────────────────────────────┘
```

## 4. El kernel (el corazón)

Generaliza dos cosas que microset ya tiene —el stream append-only `logs:LogEntry[]` y la capa de
proyecciones puras— a un plano de datos + **dos contratos chicos** (a propósito, no un god-type).

### Contrato 1 — `Schedulable`
`{ date, time|null, window?, status: pending|done|skipped|snoozed|partial, earliest?, priority? }`
El **mismo engine puro** ubica los tres: Pausa (micro-blocks, modo *spread*), Entreno (sesiones,
modo *clustered/windowed*), Nutrición (comidas a hora fija).

### Contrato 2 — `ActivityEvent` + el "sobre" de métricas
```ts
ActivityEvent {
  id, at, module, kind,        // p.ej. 'pausa.set.done' | 'entreno.session.done' | 'nutricion.meal.logged'
  personId,                    // default 'self' (dueño); solo Nutrición escribe otros (hogar)
  v, payload,                  // payload OPACO al kernel (privado del módulo)
  metrics?                     // el SOBRE — lo único que leen las capas
}
```
**El sobre `ActivityMetrics` v1 (todos opcionales, versionado aparte del payload):**
`effortXp · muscleXp{BodyGroup} · volumeLoad · durationMin · kcal · macros · adherence · consistency`.
Cada módulo lo produce con un mapper puro `contribute(kind, payload)`.

> **La regla que decopla todo:** las capas (gamificación/social/coach/stats) leen **solo el sobre**,
> nunca el payload. Por eso atraviesan todos los módulos con **cero cross-import**. Un pull-up de
> Pausa y un remo de Entreno emiten `muscleXp:{back}` → suman al mismo atributo "espalda" sin saber
> si fue "set" o "sesión". Una comida simplemente no aporta métricas de entreno.

### Registro de módulos
Cada módulo trae un manifest:
`{ id, ownedFileGroup, schedulers, uiSurfaces, toolNamespace, contribute(), buildContext(),
   sync: 'never'|'opt-in'|'derived-only'|'full', shareable, scoredInLeague, defaultEnabled }`.
Boot monta solo los habilitados.

### Local-first + persistencia
El log es **lógicamente uno** pero **físicamente particionado** por módulo (`pausa/logs.json`,
`entreno/sessions.json`, `nutricion/meals.json`), unido en memoria para derivar. Un solo store
zustand = slice de kernel + slices por módulo. Migración de **dos niveles** (versión de schema del
kernel + versión por módulo). Se reusa `files.ts` tal cual: `groups()` → registro de grupos por
módulo, `sanitize()` → validadores por módulo, el loop debounce/watch/reconcile igual.

### Multi-persona (hogar)
Cada evento lleva `personId` (default `self`). **Pausa/Entreno fuerzan `personId===self`** en el
borde de escritura; solo Nutrición escribe miembros del hogar. Gamificación/Social operan sobre el
dueño → el camino single-user no cuesta nada.

### `personId` ↔ identidad Clerk  ⚑
El `personId` del dueño es **siempre un uuid local**, con una **tabla de mapeo** a la identidad
Clerk cuando la nube está activa. Esto habilita sincronizar **tu propia** actividad entre tus
dispositivos (desktop + celu) y define desde ya que los eventos lleven `deviceId` + reloj lógico.

## 5. Módulos

### Pausa  *(= microset de hoy — adaptar lo existente)*
Repartir micro-sets de calistenia en la jornada y reprogramar al posponer. La cara **liviana**:
tray + floating panel + toast (protegido por una regla de import-boundary: el panel solo importa
kernel + pausa). Dueño de: day-types, patrón semanal, overrides por fecha, ventana laboral,
foco/DND. Depende **solo del kernel**.

### Entreno  *(nuevo)*
Sesiones estructuradas **multi-modalidad** (gym / deporte afuera / casa) con **reprogramación
adaptativa cross-día**. Vive en la ventana Studio; **no** trae widget.

- **No es una vista ni una semana aparte.** La **semana es única** y vive en **Rutina** (la misma
  tira lun→dom de Pausa: day-type de casa/oficina + descanso). Entreno es una **capacidad** que se
  *surfacea* sobre esa semana, no un calendario paralelo:
  - **Biblioteca de sesiones** (crear/editar estructuradas o externas "salida") → sección SESIONES
    embebida en **Rutina**.
  - **Asignación a la semana** → un selector de "salida" por día en la misma tira semanal de Rutina
    (`entreno.week[i]`, alineado con la `week` de Pausa). Un día puede ser *casa* (day-type) **+**
    *salida* (sesión).
  - **El día de hoy** → la sesión asignada aparece como un **bloque en Hoy** (con su ventana si la
    tiene, modalidad y "afuera" si `location=away`), con las acciones HECHA / NO HECHA-con-motivo y
    la **adaptación** del planner in-line.
  - **Planner adaptativo** → una capacidad derivada (no una UI propia): siembra la respuesta al
    motivo donde haga falta (Rutina/Hoy).
  Con el módulo **apagado** (default) nada de esto se monta: Rutina/Hoy/sidebar quedan idénticas a hoy.
- Una sesión lleva `modality` (calistenia/fuerza/deporte/cardio), `location` (casa/afuera) y
  `external` (p.ej. BJJ: no logueás series, logueás hecho/duración/intensidad).
- **Adaptación consciente del motivo** (requisito, caso de uso real): al posponer, la sesión lleva
  un motivo `enfermo | lesionado | ocupado | viajando`, y **el motivo dirige la respuesta**:
  - `enfermo/lesionado` → **no compensa carga**; sesga a descanso o movilidad liviana.
  - `ocupado/viajando` → **sustituye** la parte entrenable en casa (lee el catálogo compartido para
    cubrir el *conditioning*; la parte de skill del deporte no se sustituye).
- El **planner adaptativo** es una proyección derivada que solo **siembra** el plan del día — el
  engine sigue day-bounded y puro. Combina: motivo + intención de la sesión + carga reciente
  (digest del kernel) + objetivos + equipo/contexto. El **coach** razona la jugada inteligente.
- Puede emitir una Signal `volumeDebt` que Pausa **MAY** consumir (opt-in) para sembrar volumen
  complementario en las pausas. Ningún módulo importa al otro.

### Nutrición  *(nuevo — privado por default)*
Comidas en crudo+cocido → macros + micros; **targets que escalan con el volumen de entreno** y son
**goal-aware (nunca sugiere déficit)**; **hogar multi-persona**; rotación semanal de proteína.
Dueño de: la base de alimentos (namespace `foods` en el catálogo del kernel), meal-logs por
`personId`, targets, dietas del hogar.

- **Privacidad y compartir (dos toggles independientes):**
  - `scoredInLeague: false` — **nunca** entra al score competitivo de la liga.
  - `sync: 'opt-in'`, `shareable: opt-in` — **privada por default**, pero con opt-in podés
    **ver/comparar/compartir comidas y planes entre amigos**. Compartir nutrición ≠ competir.
- Lee del kernel **solo** `trainingVolume(range)` + `latestBodyweight()` para escalar targets, y los
  objetivos para la regla del piso. **Nunca importa Entreno ni Cuerpo.**

## 6. Capas transversales

### Gamificación
Proyección pura (generaliza `levels.ts`) sobre el sobre de métricas. Pausa+Entreno **comparten los
6 atributos** por grupo muscular (`muscleXp`); la racha y la adherencia son **por módulo**.
- **Comparabilidad sin sumar magnitudes crudas:** cada módulo reporta adherencia self-relative
  (0..1 vs su propio plan) y esfuerzo en unidades normalizadas (`xp/K`); solo eso combina al NIVEL,
  **normalizado por cantidad de módulos activos** (la amplitud no infla el rango; a lo sumo es un
  logro).
- **Racha unificada = modo ancla** (preserva la Racha actual de Pausa; otros módulos la protegen).
- **Score de la liga = `sqrt(effortXp) × consistencia + bonusCierre`**, peso ~60/40 esfuerzo,
  reset semanal (season key `AAAA-Wnn` client-side, anclado a la semana local). Sin handicap por
  nivel (la progresión ya ecualiza).
- **Nutrición: scoring opt-in y separado, con guardrails no-negociables** (riesgo TCA): penalización
  **asimétrica** por bajar del piso de proteína/kcal, proximidad a una **banda-objetivo** (no
  "menos = mejor"), **auto-supresión del score si detecta déficit bajo carga alta**, atributos de
  **proceso** (no de restricción).

### Social / Amigos  *(opt-in, la única superficie de red)*
Convex + Clerk. Lee **exclusivamente** stats derivadas de entreno vía un **share-boundary selector**
que estructuralmente no puede leer eventos privados ni de Nutrición. Grupos en **tablas propias**
(no Clerk Orgs). Liga = solo contribuciones Pausa+Entreno. Los eventos crudos **nunca** salen; las
stats de amigos entran a un cache read-only que no se mezcla con el log local. Nutrición tiene su
**propio** canal de compartir opt-in (ver arriba), aparte de la liga.

### Coach IA  *(multi-dominio)*
Su catálogo de tools = la **unión** de los namespaces de acción de los módulos activos
(`pausa.*` + `entreno.*` + `nutricion.*`). Su contexto = el merge de `buildContext()` de cada módulo
+ un **digest cross-módulo** (rollup del sobre de métricas). **Requisito confirmado:** los agentes
de cada módulo tienen contexto del status del usuario en los otros módulos (es local, no es
compartir) — ej.: el coach de Entreno ve tu nutrición/recuperación y por eso puede decidir "hoy
descanso". Los 3 modos (Claude Code editando los config por módulo / API / local) siguen andando: el
files-mirror se generaliza a carpetas por módulo, cada una con su `CLAUDE.md` y validador.

## 7. Shell / UX
UI de dos niveles manejada por el registro: con **un solo módulo** se ve **exactamente la app de
hoy** (el "spine" de módulos aparece recién con el 2º módulo). Con ≥2 módulos, un hub **CONSOLA**.
El tray + panel + toast quedan como instrumento **permanente y liviano de Pausa** (bundle separado,
regla de import-boundary, chunk-size en CI).

### Distribución y usabilidad
- **Una sola app, no varias.** Todo (Pausa, Entreno, Nutrición) vive en el mismo binario; el usuario
  no instala módulos por separado — los **prende/apaga** desde Ajustes. Prender es puramente aditivo;
  apagar oculta la UI sin borrar datos.
- **La semana es unificada.** Una sola tira lun→dom en **Rutina** manda para todos los módulos
  (day-type de Pausa + salida de Entreno sobre el mismo día). Los módulos no traen calendarios
  paralelos: cada uno *surfacea* sobre la semana y el "Hoy" comunes.
- **Cada módulo se muestra donde tiene sentido**, no en una pestaña genérica: Entreno se integra en
  Rutina (biblioteca + asignación) y en Hoy (bloque del día + adaptación), no en una vista aparte.
- **Onboarding "¿qué querés?" — pendiente.** Un primer arranque que pregunte el objetivo (moverme en
  la jornada / entrenar estructurado / cuidar la comida) y **prenda los módulos correspondientes**
  con una semana sembrada. Hoy el default es solo Pausa; el resto se prende a mano.

## 8. Faseo — strangler-fig (arranca desde hoy, sin rewrite)

| Fase | Qué | Por qué |
|---|---|---|
| **0 · Extracción del kernel** | Partir el store en slice kernel + slice pausa; `files.ts` a grupos por módulo; envolver `LogEntry` en eventos `pausa.set.done`; `Schedulable`; registro con solo Pausa; migración v5→v6, todos default a `{pausa}`, data intacta. **Cero cambio de comportamiento.** | Refactor de la app existente sobre el kernel primero, probado como migración limpia. Evita generalizar en el aire |
| **1 · Promoción de capas** | `levels.ts` lee el sobre de métricas; coach registry-driven. Todavía un módulo. | Endurecer los contratos de gamificación/coach sobre data real de Pausa antes de que otro módulo dependa |
| **2 · Entreno** | 1er 2º módulo real: `Schedulable` clustered + `ActivityEvent` + `contribute()`; planner adaptativo cross-día; namespace `entreno.*`; aparece el spine. Pausa+Entreno comparten atributos. | Solo un 2º módulo real revela si las abstracciones del kernel son correctas |
| **3 · Nutrición** | food DB; meal-events por `personId` (`sync:'opt-in'`, `scoredInLeague:false`); targets que escalan con `trainingVolume`; hogar; guardrails de scoring. | Entrega el "targets escalan con entreno" + ejercita privacidad y hogar |
| **4 · Social / cloud** | Convex + Clerk detrás de la capa Social; proyección derived-only; liga; cache de amigos. Canal opt-in de compartir nutrición. | La capa social va última, encima, sin tocar el write path local |
| **5 · Escala** | Rollup diario de métricas + reads por ventana; sync opcional de la actividad propia entre dispositivos (union de eventos por id — habilita mobile). | El log vive años y se multiplica con Nutrición |

## 9. Decision log (resuelto)

**Arquitectura/kernel:** nombre madre = **BASE** (microset = módulo Pausa) · `ActivityMetrics` v1 =
los 8 campos de §4 ⚑ · medidas corporales = **capacidad del kernel** (UI "Cuerpo" adelante) ·
catálogo = **kernel-owned** · **dos registros** (módulos vs capas) · `personId` = **uuid local +
mapping a Clerk** ⚑.

**Gamificación:** racha = **ancla** · NIVEL **normalizado por módulos activos** · peso liga **~60/40
esfuerzo** · compresión **sqrt** · **bonus cierre sí** (chico) · **sin handicap por nivel** · top-up
Entreno→Pausa = **opt-in**.

**Nutrición:** **no puntúa en la liga**; **sí** compartible opt-in (ver/comparar/compartir) ·
scoring nutrición = **opt-in separado + guardrails no-negociables** 🔒 · agentes con contexto
cross-módulo del propio usuario.

**Social/backend:** **Convex + Clerk** · grupos **tablas propias** · sync en el **webview** primero ·
reset **season key client-side** · **check imperativo + helper + tests** (no RLS/Supabase) · liga
offline = **cache con sello "última sync"**.

**Transversal:** **mobile-ready** (lógica en TS portable; solo Pausa es desktop).

## 10. Riesgos

- **Generalización prematura** → strangler-fig: endurecer cada costura solo cuando un 2º módulo real
  tira de ella (Fase 0 no cambia comportamiento).
- **Migración de la config real de Erik** → grupos aditivos, conservar nombres de archivo, migrar
  one-way con backup, extender el sanitizer a cada grupo nuevo.
- **El sobre de métricas es el acoplamiento central** → todo opcional, kernel-owned, versionado
  aparte, extendido solo aditivamente; el digest del coach es el test de aceptación de que v1 alcanza.
- **Bloat del widget** → regla eslint (panel → kernel+pausa), bundle separado, chunk-size en CI.
- **Crecimiento del log** → reads por ventana + rollup diario antes de que el digest cross-módulo
  se ponga caro.
- **Fuga de privacidad de Nutrición** → default privado; el canal de compartir es opt-in y explícito;
  el share-boundary de la liga no puede leer eventos de nutrición; test que lo asegura.
- **Trastorno alimentario (el riesgo #1 de producto)** 🔒 → los guardrails de §6 son *load-bearing*,
  no opcionales.
- **Cross-día vs day-bounded** → el engine queda day-bounded; la adaptación es un planner derivado
  que solo siembra el plan.
- **Equity de marca/SEO** → microset queda como nombre público de Pausa; co-migrar landing/release
  solo deliberadamente.

## 11. Decisiones que aún no hace falta cerrar
- Registry: dos registros vs uno con discriminante (recomendado: dos) — confirmar al implementar Fase 0.
- Dónde vive físicamente el boundary Convex+Clerk (capa dentro de la app leyendo el share-boundary
  selector, recomendado) — confirmar en Fase 4.
- Detalle del rollup y del reloj lógico para sync multi-dispositivo — Fase 5.
