# microset — Domain Model (target)

The **target** domain model microset evolves toward. Designed for the end-state
(methodologies, progression, weekly plans, the M6 AI coach) but built **incrementally**.

> **Golden rule:** design for the end-state, implement per phase, and keep defaults simple
> — a casual user never has to touch methodologies, variants, or the weekly editor.
> (methodology = Grease-the-Groove, week = same day repeated, variant = bodyweight.)

Legend: ✅ implemented · 🛠️ partial · ⬜ planned

---

## Core concepts

### Exercise (catalog) ✅
`{ id, name, muscle, equipment[], measure, axis[] }` — the static library.
`measure: 'reps' | 'hold'` disambiguates reps vs seconds (kills "reps semantics" issue).

### Intensity axis & Variant ⬜ (the spine of progression)
Every exercise has an **intensity axis**; you record which rung you're on:

```
ASSIST ───────────── BODYWEIGHT ───────────── LOAD
banda ancha→fina      peso corporal           +5kg, +10kg…
```

`Variant { id, label, kind: 'assist' | 'bodyweight' | 'load', value? }`
Progress = climbing the axis (e.g. dips: banda ancha → banda fina → libre → +5kg).

### Prescription 🛠️ (sets ✅ · target editable 🛠️ · variant/load ⬜)
How you train an exercise on a given day:
`{ exerciseId, variantId?, sets, target }` where `target` = reps or seconds.
Today: `RoutineItem { exerciseId, name, sets, target? }`. The variant/load come in Fase 1.

### Methodology ⬜
A template that **parametrizes** prescriptions: frequency, volume, intensity, rep scheme,
rest. Presets: **Grease-the-Groove**, **5×5**, **EMOM**, **Libre (manual)**. Applying one
auto-fills prescriptions; the user can override. The M6 agent selects/tunes it from the
user's goals, characteristics and preferences (known methodologies or the user's own).

### DayType & WeekPlan ⬜
`DayType { id, name, methodologyId, prescriptions[] }` — e.g. Empuje / Tirón / Full / Descanso.
`WeekPlan { mon..sun: dayTypeId, dayKind?: 'home' | 'office' }` — assigns a day-type to each
weekday; supports rest days and home-office vs office. Default: one day-type repeated.

### Log ⬜ (optional → progression)
`Log { date, blockId, variantId, repsDone?, load?, rpe?, note? }` — optional record of what
you actually did. Feeds the progression view and the agent ("subiste de banda ancha a media,
¿listo para peso?"). Never mandatory.

### Equipment 🛠️ (on/off ✅ · attributes ⬜)
`{ id, name, attrs? }`. Attributes later carry band resistance levels, available weights,
etc. — the data the assist/load variants and the agent need.

---

## Current source layout

- `src/lib/engine/` — pure scheduling (`Block`, `Settings`, `RoutineItem`, `Warning`,
  `createDayPlan`, `reschedule`, actions). Stays framework-free + tested.
- `src/domain/` — `Equipment`, `Exercise`, catalog + seed. Grows toward Variant/Methodology.
- `src/store/` — Zustand state wiring engine + domain; persistence.

---

## Phase map (kills the UX/product backlog in clusters)

- **Fase 0** ✅ — Quick wins: editable target (prescription seed), routine↔equipment coherence,
  feasibility in the editor, push/pull/core balance.
- **Fase 1** ✅ — Variants + intensity axis + optional logging + per-exercise progression
  (band levels modeled as variant rungs).
- **Progreso v2a** ⬜ — Make the progress view show a *trajectory*, not a snapshot: weekly
  summary (vs last week + streak), a "you are here → next" level marker with the date it was
  reached (derived from logs), and a real volume trend. Self-contained polish on Fase 1 data
  (no overlap); finishes Fase 1's value. Do alongside / just after Fase 2.
- **Progreso v2b (nudges)** ⬜ — "ready to level up" suggestions. Overlaps with Fase 2
  (methodology defines readiness) and M6 (agent), so it's folded into those, not standalone.
- **Fase 2** ✅ — Methodology presets (apply sets + rest across the routine) + a simple
  "ready to level up" nudge in Progreso (v2b lite).
- **Fase 3** ⬜ — DayType + WeekPlan (split, rest days, home/office).
- **Fase 4** ⬜ — Catalog UX (search/group/detail, custom exercises) + Equipment onboarding.
- **M6** ⬜ — AI coach sits on top: consumes methodologies, variants/logs, week + goals/diet.

See [ROADMAP.md](ROADMAP.md) for the product milestones.
