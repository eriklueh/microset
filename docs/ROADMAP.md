# microset — Roadmap & Design

This is the living source of truth for *what* microset is and *why*. Update it as
decisions change. For day-to-day dev context see [../CLAUDE.md](../CLAUDE.md).

---

## Vision

A desktop coach for **active breaks during home office**. You upload your weekly/daily
routine; microset spreads it into small **blocks** across your workday, notifies you when
a set is due, asks **"are you doing it now?"**, and when you say no it **reorganizes the
remaining day** so the planned volume still fits.

Training concept: **grease the groove** — frequent submaximal sets (pull-ups, dips on home
bars) distributed through the day instead of one long session.

---

## Architecture

### Two surfaces, one Tauri app

Both share the same SQLite DB and the same scheduling engine; they are just different
windows/views.

1. **Widget mode** — system tray + always-visible floating panel. Lightweight, always on.
2. **Studio mode** — full window: manage exercises/equipment, build routines, view stats.

### The brain / shell split

- **Scheduling engine** — pure TypeScript in `src/lib/engine/`. Deterministic, offline,
  unit-tested. Decides *when*. No React/Tauri/network dependencies.
- **AI coach** (M6, optional) — Claude API. Recommends *what* (exercises/routine) from your
  equipment + goals. Online, occasional, never blocks the offline core.

> **The engine thinks about timing; the coach thinks about content.**

---

## Data model (draft)

- **Equipment** — your tools: dip bar, pull-up bar, band, etc.
- **Exercise** — `name`, `equipment` (required), `muscleGroup`, `difficulty`, default
  `sets`/`reps`/`rest`. Enables "what can I do with what I have?".
- **Routine** — per day/week: list of exercises with target volume.
- **Block** — `date`, `time`, `exercise`, `sets`, `status` (`pending` | `done` | `skipped`
  | `snoozed`). A block = one chunk you do in a single micro-break.
- **Settings** — work window (e.g. 09:00–18:00), min rest between blocks, avoid windows
  (lunch), notification cadence, block granularity.

Seed a starter library of calisthenics exercises mapped to equipment, so there's something
usable on day 1 without the AI coach.

**Block granularity**: configurable; default = *one exercise per break*.

---

## Scheduling engine (the "intelligent" part)

Rule-based, no ML needed — deterministic, offline, predictable (important for something
that interrupts you all day).

Core shape: a pure function `schedule(state, now) -> Block[]`.

Greedy even-distribution with live recompute:

1. Compute available slots between `now` and the end of the work window, minus avoid
   windows (lunch).
2. Take pending blocks; distribute them evenly, spaced by
   `max(minRest, availableTime / remainingBlocks)`.
3. On **"can't now"**: the block returns to the pool; recompute over the remaining window.
   If it no longer fits with ideal rest, compress toward `minRest`; if still impossible,
   warn and prioritize (compound lifts first) instead of failing silently.

Because it's a pure function, re-run it on every relevant event (app start, block answered,
timer tick) and on a fresh state.

Later (post-M6): a "smart" layer could learn the hours you always decline and suggest
better windows — built on top, never replacing the rules.

---

## Milestones

### ✅ M0 — Scaffold (done 2026-06-13, commit 3105cfc)
Tauri v2 + React 19 + TS + Vite; Tailwind v4 + shadcn (radix-nova, neutral); system tray
(Abrir/Salir) with **close-to-tray**; window 960×720; identifier `com.microset.app`.
Verified: Rust compiles (MSVC) and the app runs.

### ⬜ M1 — Scheduling engine ← next
Pure TS in `src/lib/engine/`: types (`Exercise`, `Block`, `Settings`), `schedule()`, and
the redistribution logic, with unit tests. No UI.

### ⬜ M2 — Studio
Exercise + equipment library and routine builder (shadcn forms/dialogs/tables) persisted to
SQLite (`tauri-plugin-sql`). Seed exercise library.

### ⬜ M3 — Notification loop
Timer fires due blocks → native notification with actions **Sí / Posponer / Ahora no** →
feeds back into the engine to recompute.

### ⬜ M4 — Floating panel
Always-visible mini-window: next exercise + countdown. On Hyprland, positioned/pinned via
windowrules.

### ⬜ M5 — Stats + polish
Weekly completion stats, autostart on boot (`tauri-plugin-autostart`), polish.

### ⬜ M6 — AI coach (optional)
Claude API agent that recommends/builds routines from your equipment + goals. Online,
opt-in. The engine then schedules whatever the coach produces. Pick the model at build time
(Sonnet is a good cost/quality default for a recommender).

---

## Linux / Hyprland deployment notes

Target: CachyOS (Arch-based) on Hyprland (Wayland). Windows is the primary dev machine.

- **Tray icon** — Tauri uses SNI/AppIndicator; Hyprland has no built-in tray, so run a host:
  **waybar with the `tray` module**.
- **Notifications** — need a daemon running: **mako**, **swaync**, or **dunst** (Tauri speaks
  the freedesktop spec, so any works).
- **Floating "always-on-top" panel** — the app can't force always-on-top on Wayland; the
  compositor decides. Use **Hyprland windowrules** matching the window class:
  ```
  windowrulev2 = float, class:^(microset)$
  windowrulev2 = pin,   class:^(microset)$
  windowrulev2 = move 100%-360 60, class:^(microset)$
  ```
  A layer-shell overlay is the advanced alternative.
- **WebKitGTK render gotcha** — may show a blank window on Wayland; fix with env
  `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
