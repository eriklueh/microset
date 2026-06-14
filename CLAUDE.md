# microset

A desktop "active-break" coach for home office. It reminds you to do calisthenics
sets (pull-ups, dips, etc. — home equipment) throughout the workday, asks if you'll
do the set *now*, and **reschedules intelligently** when you decline so the day's
volume still fits. Concept anchor: *grease the groove* (frequent submaximal sets
spread across the day).

> Full design & milestones live in [docs/ROADMAP.md](docs/ROADMAP.md). Keep that file
> updated as the plan evolves — it's the source of truth for *what* and *why*.

## Two surfaces, one app

microset is a single Tauri app with two UIs sharing the same SQLite DB and engine:

- **Widget mode** — system tray + always-visible floating panel. Lightweight, always
  running. This is the day-to-day reminder surface.
- **Studio mode** — full window to manage exercises/equipment, build routines, view
  stats. This is where shadcn/ui is used heavily.

## The "brain" split (important)

- **Scheduling engine** (`src/lib/engine/`, planned): **pure TypeScript, deterministic,
  offline, unit-tested.** Decides *when* each set happens and recomputes the day when
  you say "not now". No React, no Tauri, no network — testable in isolation.
- **AI coach** (later, M6, optional): a Claude API call that recommends *what* exercises/
  routine given your equipment + goals. Online, occasional, never blocks the core.

Rule of thumb: **the engine thinks about timing; the coach thinks about content.** Keep
business logic out of components.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Tauri v2 (Rust) — tray, notifications, autostart, windows |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind v4 (`@tailwindcss/vite`) |
| Components | shadcn/ui — style `radix-nova`, neutral base, Lucide icons, Geist font |
| Storage | SQLite via `tauri-plugin-sql` (planned) |
| Package manager | **pnpm** (required — see gotchas) |

## Project structure

```
microset/
├── src/                      # React frontend
│   ├── lib/engine/           # 🧠 scheduling engine (pure TS + Vitest)
│   ├── lib/utils.ts          # cn() helper (shadcn)
│   ├── domain/               # exercise/equipment model + seed data
│   ├── store/                # Zustand store (state + JSON persistence)
│   ├── hooks/                # useScheduler (notification timer)
│   ├── lib/notify.ts         # native notifications + action buttons
│   ├── components/studio/    # Studio views (Hoy/Rutina/Equipo/Ajustes)
│   ├── components/panel/     # FloatingPanel (always-on-top widget)
│   ├── store/sync.ts         # cross-window state sync (Tauri events)
│   ├── components/ui/        # shadcn components
│   ├── App.tsx
│   └── index.css             # Tailwind + shadcn theme (oklch, light/dark)
├── src-tauri/                # Rust shell
│   ├── src/lib.rs            # app setup: tray, window events, commands
│   ├── src/main.rs
│   ├── tauri.conf.json       # window, identifier (com.microset.app), bundle
│   └── Cargo.toml            # tauri features (tray-icon enabled)
├── docs/ROADMAP.md           # design + milestones (source of truth)
├── components.json           # shadcn config
└── CLAUDE.md
```

## Commands

```bash
pnpm install                  # install JS deps
pnpm tauri dev                # run the app (Vite + cargo, opens window)
pnpm build                    # type-check + build frontend (tsc && vite build)
pnpm tauri build              # production build (installers)
pnpm dlx shadcn@latest add X  # NOTE: use `npx` not `pnpm dlx` — see gotchas
cargo build                   # (in src-tauri/) compile Rust only
```

## Conventions

- **Engine is framework-free.** Anything schedule/time-related goes in `src/lib/engine/`
  as pure functions with tests, not in components or Rust.
- **shadcn for Studio UI**, trimmed components for the widget/floating panel.
- **Theme & translucency:** light/dark/system + accent presets in `src/lib/theme.ts` (toggles `.dark` + `[data-accent]`, persisted in the store). Windows are transparent with native **mica** (main) / **acrylic** (panel) applied in `lib.rs` via `window-vibrancy` (Windows only; Linux/Hyprland uses compositor blur). Surfaces use `bg-card/60 backdrop-blur-xl`; numerals use `font-mono` (Geist Mono).
- Spanish is fine in user-facing copy (the user is a Spanish speaker); keep code/identifiers
  in English.
- Keep `tauri.conf.json` identifier `com.microset.app`.
- Closing the main window **hides to tray** (does not quit) — quit is via tray → "Salir".

## Cross-platform

Developed on **Windows 11**; also targets **CachyOS / Hyprland (Wayland)**. On Hyprland the
tray needs waybar's `tray` module, notifications need a daemon (mako/swaync/dunst), the
floating panel uses Hyprland windowrules, and WebKitGTK may need
`WEBKIT_DISABLE_DMABUF_RENDERER=1`. Details in [docs/ROADMAP.md](docs/ROADMAP.md#linux--hyprland-deployment-notes).

## Gotchas (learned the hard way)

- **pnpm, not npm.** Settings live in `pnpm-workspace.yaml` (pnpm 10+ ignores the `pnpm`
  field in package.json). esbuild's build script must be approved there (`allowBuilds`).
- **shadcn via `npx`, not `pnpm dlx`** — `pnpm dlx shadcn` fails to resolve `zod`. Pass the
  preset to avoid the interactive prompt, e.g. `npx -y shadcn@latest init -t vite -b radix -p nova`.
- **Windows / PowerShell:** newly installed tools aren't on PATH until the shell restarts;
  the execution policy may block `.ps1` (npm/pnpm) — fix with
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Roadmap (status)

- ✅ **M0** — Scaffold (Tauri + React + Tailwind + shadcn, tray, close-to-tray)
- ✅ **M1** — Scheduling engine (`src/lib/engine/`, pure TS + Vitest, 9 tests)
- ✅ **M2** — Studio (tabs Hoy/Rutina/Equipo/Ajustes; Zustand store, JSON persistence)
- ✅ **M3** — Notification loop (`useScheduler` + native notifications, action buttons)
- ✅ **M4** — Floating panel (2nd always-on-top window; cross-window sync via Tauri events)
- ⬜ **M5** — Stats + autostart + polish ← **next**
- ⬜ **M6** — AI coach (Claude API, optional)
