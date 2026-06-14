# microset — Domain Model (target)

The **target** domain model microset evolves toward. Designed for the end-state
(methodologies, progression, weekly plans, the M6 AI coach) but built **incrementally**.

> **Golden rule:** design for the end-state, implement per phase, and keep defaults simple
> — a casual user never has to touch methodologies, variants, or the weekly editor.

Legend: ✅ implemented · 🛠️ partial · ⬜ planned

> **Status (2026-06-14):** Fases 0–4 done. Remaining: M6 (AI coach) and M5
> (autostart + installer). See [ROADMAP.md](ROADMAP.md) for milestones.

---

## Core concepts

### Exercise (catalog) ✅
`{ id, name, muscle, equipment[], measure, axis[] }` — seed library + user **custom
exercises** (`useCatalog` = seed + custom). `measure: 'reps' | 'hold'`.

### Intensity axis & Variant ✅
Every exercise has an **intensity axis**; the user records which rung they're on:

```
ASSIST ───────────── BODYWEIGHT ───────────── LOAD
banda ancha→fina      peso corporal           +5kg, +10kg…
```

`Variant { id, label, kind: 'assist' | 'bodyweight' | 'load' }`. Progress = climbing the axis.
(Custom exercises ship with a single bodyweight rung.)

### Prescription ✅ (load value ⬜)
`RoutineItem { exerciseId, name, sets, target?, variantId? }` — sets + editable target
(reps/seconds) + current variant. Explicit `+kg` load *value* tracking is still ⬜.

### Methodology ✅ (rep-scheme parametrization ⬜)
Presets in `src/domain/methodologies.ts` (**Grease-the-Groove, Volumen, Fuerza,
Mantenimiento, Libre**). Applying one sets **sets + rest** across the selected day-type.
Richer parametrization (per-exercise rep schemes, intensity) and agent-driven selection: ⬜.

### DayType & WeekPlan ✅
`DayType { id, name, routine }` + `week: (dayTypeId | 'rest')[7]` + `dayKind: ('home' |
'office' | null)[7]`. Assign a day-type or rest to each weekday. (Methodology is currently
global, not per day-type — a future refinement.)

### Log 🛠️ (richer fields ⬜)
`LogEntry { at, exerciseId, variantId? }` — recorded on every "Hecho". Feeds Progreso
(trajectory, streak, volume, level marker, ready-to-level nudge). `repsDone / load / rpe /
note` per set: ⬜.

### Equipment 🛠️ (attributes ⬜)
`{ id, name }` on/off. Band resistance is modeled as **variant rungs** rather than equipment
attributes; richer attributes (weights, etc.) still ⬜.

---

## Source layout

- `src/lib/engine/` — pure scheduling (framework-free + tested).
- `src/domain/` — `Exercise`/`Equipment` model, seed catalog, methodologies.
- `src/hooks/useCatalog.ts` — seed + custom exercises.
- `src/store/` — Zustand: day-types, week, logs, settings, prefs; persistence (+ migration).

---

## Phase map (the UX/product backlog, killed in clusters)

- **Fase 0** ✅ — editable target, routine↔equipment coherence, feasibility, push/pull/core balance.
- **Fase 1** ✅ — variants + intensity axis + optional logging + per-exercise progression.
- **Fase 2** ✅ — methodology presets (apply sets + rest) + a "ready to level up" nudge (v2b lite).
- **Fase 3** ✅ — day-types + weekly plan (split, rest days, home/office).
- **Fase 4** ✅ — searchable/grouped catalog + custom exercises + equipment onboarding.
- **Progreso v2a** ✅ — trajectory view: weekly summary (vs last week + streak), "you are
  here → next" level marker with date reached, volume trend.
- **Progreso v2b (full nudges)** 🛠️ — basic nudge shipped; richer "ready to progress" logic
  belongs to M6 (the agent / methodology rules).

**The whole UX/product backlog (the 14-point critique) is done.** What's left is product
direction, not refinement:

- **M6 — AI coach** ⬜ — sits on top: consumes methodologies, variants/logs, the week +
  goals/diet to build a multi-day plan the engine schedules.
- **M5 — autostart + installer** ⬜ — see ROADMAP.
