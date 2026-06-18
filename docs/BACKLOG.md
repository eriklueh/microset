# microset — Backlog

Ideas and parked work that aren't committed milestones yet. The committed plan lives in
[ROADMAP.md](ROADMAP.md); this file is the looser idea queue — product bets, Marathon UI/UX
polish, and small fixes we deliberately deferred. Promote items to the roadmap as they're
picked up.

**Status:** ✅ shipped · 🔜 next · 🧪 in progress · 💡 idea · 🩹 parked fix
**Effort:** S (hours) · M (a day-ish) · L (multi-session)

---

## Product

| Item | What | Effort | Status |
|---|---|---|---|
| **Hoy = timeline/relay** | Hoy rebuilt as a vertical HUD relay track: spine of nodes, a "NOW" marker head above the next set, done/skipped/pending nodes, the next set as the live node (countdown when ahead, inline actions when due). | M | ✅ |
| **Quick-log free sets** | A "+ registrar" affordance (panel + Hoy) to log a set done off-schedule. Feeds progression + balance. HUD stamp on log. | M | 💡 |
| **Focus / DND window** | Tray/panel toggle that silences reminders for N min (meeting, deep work) without breaking the day's plan. `FOCO` state, dimmed chrome + pixel countdown. | S–M | 💡 |
| **Proactive coach diagnostics** | The Coach onboarding greets you with a "WHAT I NOTICED" section: data-driven alerts from your logs (inactivity, planned-but-neglected group over 14d, volume drop vs last week) as one-tap fix prompts. Computed in `snapshot.ts`. (Decline/postpone patterns deferred — logs only store completed sets.) | S–M | ✅ |
| **One-tap level up** | The "ready to level up" nudge exists in Progreso; add the button that applies the variant change directly (today you must go to Rutina). | S | 💡 |
| **Weekly review ritual** | A Sunday coach-generated summary: done vs planned, with one-tap tweaks to next week. Closes the coach + logs + week loop. | M | 💡 |
| **RPE quick feedback** | Optional "fácil / justo / duro" tap after DONE; feeds progression (ready-to-level today uses raw counts). | M | 💡 |
| **Calendar / .ics integration** | Read OS calendar / meetings to dynamically extend `avoidWindows` so reminders dodge meetings. Highest-value for desk workers, biggest scope. | L | 💡 |
| **Achievements / milestones** | Pixel "badges" for streak/volume milestones. Keep it sober, not gamified-cheesy. | M | 💡 |
| **Export week as Marathon card** | Render the week/stats as a shareable HUD poster image. Doubles as real landing assets. | M | 💡 |
| **Stats depth** | Time-of-day completion heatmap (when you actually do vs skip), balance over time, desk-vs-full completion. | M | 💡 |

## UI/UX — Marathon

| Item | What | Effort | Status |
|---|---|---|---|
| **Tray icon live gauge** | Tray icon renders the day's progress (ring/bar of sets done) — glanceable without opening. Rust-side icon rendering. | M–L | 💡 |
| **Power-on scan splash** | A one-shot subtle `ms-scan` sweep on app open — the "instrument booting" touch. | S | 💡 |
| **Rest-day HUD screen** | A dedicated `DESCANSO · RECUPERACIÓN` screen with a calm variant of the chrome, instead of the generic empty state. | S | 💡 |
| **Pixel numeral audit** | Ensure every big figure uses Geist Pixel consistently (streaks, counters, ETAs) — it's uneven across views. | S | 💡 |
| **Light-mode calibration** | The dot-grids / RegMarks / glows are tuned for dark; recalibrate the tokens per theme so light mode holds up. | M | 🩹 |
| **Equipo / Ajustes cockpit** | They use the shared `ViewHeader` but are plain full-width. Give them `SectionRule` chrome and/or a contextual rail like the other views. | M | 💡 |
| **Motion discipline** | Codify the small Marathon motion set (blink, scan, deplete) and honor `prefers-reduced-motion`. | S | 💡 |
| **Onboarding = calibration sequence** | First-run sets equipment / work window / goals as a HUD wizard. | M | 💡 |
| **Command palette / global hotkey** | Power-user: hotkey to "done next set" or open the panel; a Marathon command bar. | M | 💡 |

## Parked fixes / tech debt

| Item | What | Effort | Status |
|---|---|---|---|
| **Coach balance label i18n** | `snapshot.ts` builds `balanceLabel` hardcoded in Spanish; localize by deriving from `snap.balance` + `t.muscle` so it follows the UI language. | S | 🩹 |
| **Autostart (M5)** | Launch-at-login via `tauri-plugin-autostart` — the last open box in M5. | S–M | 💡 |
| **Bundle size warning** | Vite warns the main chunk is >500 kB; consider `manualChunks` / dynamic import for `react-markdown`, body-highlighter, etc. | S | 🩹 |
| **Landing refresh** | Hero mock refresh + real app screenshots (Erik's task), now that Studio + panel + toast are all Marathon. | M | 💡 |

---

> Convention reminder: Spanish in user-facing copy, English in code identifiers; pnpm only;
> never commit the updater private key; release asset must stay `microset-setup-x64.exe`.
