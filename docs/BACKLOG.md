# microset — Backlog

Ideas and parked work that aren't committed milestones yet. The committed plan lives in
[ROADMAP.md](ROADMAP.md); this file is the looser idea queue — product bets, Marathon UI/UX
polish, and small fixes we deliberately deferred. Promote items to the roadmap as they're
picked up.

**Status:** ✅ shipped · 🔜 next · 🧪 in progress · 💡 idea · 🩹 parked fix
**Effort:** S (hours) · M (a day-ish) · L (multi-session)

> Tanda **2026-06-30** (en `main`, pendiente de release **v0.1.2**): se cerraron de una pasada
> todas las tareas de 2/3/5 pts — módulo Niveles (racha, character sheet, logros, off-switch,
> subir de nivel), quick-log, modo foco, splash/rest-day/pixel/motion, cockpit Equipo/Ajustes,
> i18n del balance del coach, code-splitting y buscar-actualizaciones. Marcadas ✅ abajo.

---

## Product

| Item | What | Effort | Status |
|---|---|---|---|
| **Hoy = timeline/relay** | Hoy rebuilt as a vertical HUD relay track: spine of nodes, a "NOW" marker head above the next set, done/skipped/pending nodes, the next set as the live node (countdown when ahead, inline actions when due). | M | ✅ |
| **Quick-log free sets** | A "+ registrar" affordance (panel + Hoy) to log a set done off-schedule. Feeds progression + balance. HUD stamp on log. → `logFreeSet` action + FreeLogPanel en TodayView. | M | ✅ |
| **Focus / DND window** | Tray/panel toggle that silences reminders for N min (meeting, deep work) without breaking the day's plan. `FOCO` state, dimmed chrome + pixel countdown. → luna en el panel → selector 15/30/60 (estado de cuerpo completo) + sección en Ajustes; `useScheduler` lo respeta. | S–M | ✅ |
| **Proactive coach diagnostics** | The Coach onboarding greets you with a "WHAT I NOTICED" section: data-driven alerts from your logs (inactivity, planned-but-neglected group over 14d, volume drop vs last week) as one-tap fix prompts. Computed in `snapshot.ts`. (Decline/postpone patterns deferred — logs only store completed sets.) | S–M | ✅ |
| **One-tap level up** | The "ready to level up" nudge exists in Progreso; add the button that applies the variant change directly (today you must go to Rutina). → botón LEVEL UP que llama `setRoutineVariant` en cada día-tipo que tenga el ejercicio. | S | ✅ |
| **Weekly review ritual** | A Sunday coach-generated summary: done vs planned, with one-tap tweaks to next week. Closes the coach + logs + week loop. | M | 💡 |
| **RPE quick feedback** | Optional "fácil / justo / duro" tap after DONE; feeds progression (ready-to-level today uses raw counts). | M | 💡 |
| **Calendar / .ics integration** | Read OS calendar / meetings to dynamically extend `avoidWindows` so reminders dodge meetings. Highest-value for desk workers, biggest scope. | L | 💡 |
| **Achievements / milestones** | Pixel "badges" for streak/volume/level milestones — the celebratory layer *on top of* the Character sheet. Keep it sober, not gamified-cheesy. → catálogo derivado de 7 logros (racha 7/30, sets 50/250/1000, grupo LVL≥3/≥5) en `levels.ts` + fila de chips en Progreso. (Falta fino: badges más elaboradas.) | M | ✅ |
| **Export week as Marathon card** | Render the week/stats as a shareable HUD poster image. Doubles as real landing assets. | M | 💡 |
| **Stats depth** | Time-of-day completion heatmap (when you actually do vs skip), balance over time, desk-vs-full completion. | M | 💡 |
| **Comeback nudge** | Active re-engagement (not just the passive coach greeting): on launch — or via the scheduler — if the last completed set was ≥ N days ago, fire a **toast/notification** "Hace X días sin entrenar — ¿arrancamos suave?" with a one-tap **easy restart** (a short deload session). Reuses the `snapshot.ts` `inactive` alert as the trigger; configurable threshold + an anti-nag cap (don't repeat daily). The restart session is a small Night-recovery–style block. | M | 💡 |
| **Night recovery ("Repechaje")** | If the day's sets went undone, an evening catch-up. Triggered by a nudge at a configurable hour (or a button on Hoy): take the day's **pending** sets, **triage by balance gap + a volume cap** (recover the few that best close today's gap, not all 8), and reschedule them into a **dense consecutive block** from now → a bedtime cutoff at **reduced intensity** (×0.5, calmer variants — no high-CNS work before sleep). Reuses three things already built: the tight per-day-type **window** mechanic (consecutive session), the **feasibility/balance** analysis (`analysis.ts`), and **intensity** scaling. Outcomes: *Exprés* (cram the key ones now) · *Cerrar el día* (accept it, no guilt; logs what you did) · *Pasar 1–2 a mañana* (carry-forward — small new concept, engine is day-bounded today). Optional hook: softens FORMA decay / saves the streak ("salvá el día"). Respects a bedtime guardrail (no nudges after lights-out). | M–L | 💡 |

## Niveles — módulo opcional (gamificación)

> **✅ Base implementada (2026-06-30, en `main`):** `src/lib/levels.ts` (puro) + Racha + Character
> sheet + Achievements (7) + Off-switch + One-tap level up. **Falta del módulo:** Placement test y FORMA.
>
> **Desactivable de raíz.** Todo esto vive como una **capa derivada pura sobre `logs.json`** (al
> estilo de `analysis.ts` / `snapshot.ts`): XP, niveles, atributos y FORMA se calculan en
> `src/lib/levels.ts` con funciones puras, **sin acoplarse al engine ni al store**. El flag
> `levelsEnabled` (toggle en Ajustes; se ofrecería prender/saltear en el onboarding) prende
> o apaga toda la presentación; apagado, Progreso vuelve a sus stats actuales. La **progresión de
> variantes sigue siendo core** (es lógica de entreno, no la piel del juego) — el módulo solo le pone
> la capa RPG encima. Así se mantiene la regla "engine = timing, módulo = vista derivada".

| Item | What | Effort | Status |
|---|---|---|---|
| **Placement test — benchmark de nivel** | Calibración de primer uso (y re-test periódico): un set a AMRAP / hold máximo por patrón de movimiento (Empuje/Tirón/Piernas/Core vía `PATTERN_PRESETS`, filtrado por equipo con `isAvailable`), auto-reportado. Cada resultado mapea a una **variante inicial** en el eje de ese ejercicio y siembra los LVL del character sheet + una **FORMA provisional** (estilo ajedrez: swings rápidos hasta N datos y después baja el K-factor). Doble valor: calibra las prescripciones reales, no solo un número. Única captura de data nueva: un registro `assessment` (resultados + fecha). Es la mitad "física" del item *Onboarding = calibration sequence* (UI/UX). | M | 💡 |
| **"Racha" — streak de consistencia** | Días consecutivos que cumplen un umbral de "día hecho" (configurable: ≥1 serie / ≥X series / ≥% del plan; default una **dosis mínima efectiva** para que no sea cheesy). **Los días de descanso planificados son neutros** — no rompen la racha (respeta el programa, no penaliza descansar). Opcional: un **freeze/gracia** (un solo fallo no resetea una racha larga; en línea con el "sin culpa" del Repechaje). Derivable 100% de los logs + el plan de semana, **sin captura de data nueva**. Es la pieza más liviana y legible del módulo (candidata a promoverse a stat base si querés que viva fuera del toggle). Se muestra como cifra pixel en Hoy / system bar / Progreso; los hitos alimentan *Achievements*. Cruza con todo: el **Repechaje la salva**, el **Comeback nudge** salta cuando se rompe, y complementa a FORMA (consistencia binaria vs. forma continua). | M | ✅ |
| **Character sheet — RPG stats** | Seis **atributos** = los seis grupos musculares (PECHO/ESPALDA/HOMBROS/BRAZOS/CORE/PIERNAS), cada uno con LVL, + un **NIVEL/RANGO** general. XP por serie completada = `roleWeight × variantDifficulty × intensity` — reusa los pesos de rol de `bodyGroups.ts` (prim 1 / sec 0.5) + el eje de variantes por ejercicio (variante más difícil → más XP) + intensidad del día (deload/normal/push), con rendimiento decreciente por grupo/día para que no se farmee volumen fácil. Acumulativo + permanente (solo sube); subir un atributo == el milestone "listo para subir" que ya existe. Vive en Progreso; el mapa muscular puede pintar cada grupo por LVL. Todo derivable de `logs.json` hoy. | L | ✅ |
| **"FORMA" — momentum rating (elo)** | Un rating **volátil** (~1000 de arranque) que puede **bajar**: cada período te comparás contra tu propio baseline móvil (volumen + dificultad) — lo superás → sube, por debajo → baja, días salteados → decay (reusa las señales de inactividad / caída de volumen de `snapshot.ts` como disparadores). Elo para un jugador solo = "vos vs tu yo de antes", computable solo con los logs de series completadas. Hace dúo con el character sheet: **stats = en quién te convertiste (permanente), FORMA = cómo venís ahora (baja si aflojás).** Ladder de tiers opcional (una "liga" sobria). Una versión por adherencia (premiar cumplir el plan) necesita persistir el planeado-vs-hecho diario + el logging diferido de declines/skips. | M–L | 💡 |
| **Off-switch + módulo aislado** | Flag `levels` en `settings.json` que gatea todo lo anterior (Ajustes + opción en onboarding); off → Progreso usa los stats actuales. Implementar XP/atributos/FORMA como funciones puras en `src/lib/levels.ts` sobre los logs, sin tocar engine/store — removible y barato de mantener. → `levelsEnabled` + `streakFreeze` en el store (migrate v3→v4) + toggle en Ajustes. | S–M | ✅ |

## UI/UX — Marathon

| Item | What | Effort | Status |
|---|---|---|---|
| **Tray icon live gauge** | Tray icon renders the day's progress (ring/bar of sets done) — glanceable without opening. Rust-side icon rendering. | M–L | 💡 |
| **Power-on scan splash** | A one-shot subtle `ms-scan` sweep on app open — the "instrument booting" touch. → `BootSplash.tsx` + keyframes one-shot (`ms-scan-once`/`ms-splash-out`), respeta reduced-motion. | S | ✅ |
| **Rest-day HUD screen** | A dedicated `DESCANSO · RECUPERACIÓN` screen with a calm variant of the chrome, instead of the generic empty state. → branch de descanso en TodayView con primitivas HUD. | S | ✅ |
| **Pixel numeral audit** | Ensure every big figure uses Geist Pixel consistently (streaks, counters, ETAs) — it's uneven across views. → `font-pixel`/`tabular-nums` aplicado en Hoy/Rutina/Progreso/panel. | S | ✅ |
| **Light-mode calibration** | Per-theme body-map ramp tokens (`--m-none/--m-sec*/--m-pri*` in `index.css`) so the model reads right on paper; on-accent text forced white in light (`--on: #fff`) so green components read as primary fills. (Optional: deepen the light accent if white contrast ever feels weak.) | M | ✅ |
| **Equipo / Ajustes cockpit** | They use the shared `ViewHeader` but are plain full-width. Give them `SectionRule` chrome and/or a contextual rail like the other views. → `CockpitRail`/`RailStat` en shell.tsx; Equipo + Ajustes refactorizados al split con rail. | M | ✅ |
| **Motion discipline** | Codify the small Marathon motion set (blink, scan, deplete) and honor `prefers-reduced-motion`. → el guard de reduced-motion ahora cubre `ms-blink`/splash + neutraliza el resto. | S | ✅ |
| **Onboarding = calibration sequence** | First-run sets equipment / work window / goals as a HUD wizard. If the *Niveles* module is on, its physical half = the **Placement test** (seeds level + provisional FORMA). | M | 💡 |
| **Command palette / global hotkey** | Power-user: hotkey to "done next set" or open the panel; a Marathon command bar. | M | 💡 |

## Parked fixes / tech debt

| Item | What | Effort | Status |
|---|---|---|---|
| **Coach balance label i18n** | `snapshot.ts` builds `balanceLabel` hardcoded in Spanish; localize by deriving from `snap.balance` + `t.muscle` so it follows the UI language. → `snapshot` expone `balanceState` estructurado; CoachView arma el label desde `t.*`. | S | ✅ |
| **Manual "Buscar actualizaciones"** | `useUpdater` only runs `check()` once on mount and `UpdateBanner` shows only in the main window; add an Ajustes button to re-check on demand + show the current version (for users who dismiss the banner or keep the app open for days). → status machine en `useUpdater` + Row en Ajustes con versión actual. | S | ✅ |
| **CoachView snapshot stale-dep** | `CoachView.tsx:64` — el `useMemo(coachSnapshot, […])` omite `customExercises` de las deps aunque `coachSnapshot` lo lee (`snapshot.ts`): crear un ejercicio propio no refresca la banda de diagnóstico hasta que cambie otra dep. Pre-existente (lo encontró el review de la tanda 06-30). | S | 🩹 |
| **Autostart — iniciar con la PC** | User-facing setting in Ajustes (default off): launch-at-login via `tauri-plugin-autostart`. The last open box in M5; explicitly requested. Pairs well with starting minimized to tray. | S–M | 🔜 |
| **Bundle size warning** | Vite warns the main chunk is >500 kB; consider `manualChunks` / dynamic import for `react-markdown`, body-highlighter, etc. → `React.lazy` para `MarkdownBody` + `BodyModel`; chunk principal ~385 kB, sin warning. | S | ✅ |
| **Cross-platform release + auto-update** | `.github/workflows/release.yml` (tauri-action) builds Win + Linux, signs both, generates `latest.json`, and re-uploads stable aliases (`microset-setup-x64.exe` / `microset-x64.AppImage`). Secret + a `vX.Y.Z` tag publish everything. **Live: v0.1.1 published 2026-06-24** (Win+Linux+`latest.json`, auto-update working). See [RELEASING.md](RELEASING.md). | M | ✅ |
| **Landing — Win + Linux downloads** | OS-aware CTA picks the right stable installer (Windows `.exe` / Linux `.AppImage`, others → releases page) + explicit per-platform links. **Live** — both stable links resolve 200 since v0.1.1. | S | ✅ |
| **Landing copy/screenshots refresh** | Hero mock + real app screenshots (Erik's task) and copy re-sync with the newest features (per-day schedule / night sessions, set actions HECHO·MÁS TARDE·SALTAR, default routines, proactive coach). | M | 💡 |

---

> Convention reminder: Spanish in user-facing copy, English in code identifiers; pnpm only;
> never commit the updater private key; release asset must stay `microset-setup-x64.exe`.
