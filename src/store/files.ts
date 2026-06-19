import { appConfigDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, watchImmediate, writeTextFile } from "@tauri-apps/plugin-fs";
import { applyTheme } from "@/lib/theme";
import { buildCoachContext } from "@/coach/context";
import { COACH_CLAUDE_MD } from "@/coach/workspace";
import { REST, useStore } from "./useStore";

/**
 * Mirror the user's config to human-editable JSON files in the OS config folder
 * (Windows: %APPDATA%/com.microset.app, Linux: ~/.config/com.microset.app).
 *
 * Files are the editable source of truth on disk; localStorage stays as the live
 * runtime cache + cross-window channel. Only the MAIN window runs this: it loads
 * files on startup, writes them (debounced) on change, and picks up external
 * edits live — by polling every couple of seconds (reliable everywhere) plus a
 * filesystem watch for instant updates where the OS delivers events. Ephemeral
 * state (today's plan, the toast) is intentionally not written.
 */
const FILES = {
  settings: "settings.json",
  routine: "routine.json",
  equipment: "equipment.json",
  exercises: "exercises.json",
  profile: "profile.json",
  coach: "coach.json",
  logs: "logs.json",
} as const;

const POLL_MS = 2000;

let dir = "";
let suppress = false; // applying disk -> store (ignore the resulting writes)
let writePending = false; // a store -> disk write is queued/in-flight
let lastWrite = 0; // when we last wrote, to avoid reconciling stale disk
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastWritten: Record<string, string> = {}; // file -> last JSON we wrote (skip unchanged)

type State = ReturnType<typeof useStore.getState>;

function groups(s: State): Record<string, unknown> {
  return {
    [FILES.settings]: {
      settings: s.settings,
      theme: s.theme,
      panelEnabled: s.panelEnabled,
      notificationsEnabled: s.notificationsEnabled,
      snoozeMinutes: s.snoozeMinutes,
      demoMode: s.demoMode,
    },
    [FILES.routine]: { dayTypes: s.dayTypes, week: s.week, dayKind: s.dayKind, dayOverrides: s.dayOverrides },
    [FILES.equipment]: { owned: s.ownedEquipment, custom: s.customEquipment },
    [FILES.exercises]: { custom: s.customExercises },
    [FILES.profile]: s.profile,
    [FILES.coach]: s.coach,
    [FILES.logs]: s.logs,
  };
}

async function writeAll(): Promise<void> {
  const g = groups(useStore.getState());
  const all: [string, string][] = [
    ...Object.entries(g).map(([file, data]) => [file, JSON.stringify(data, null, 2)] as [string, string]),
    // read-only snapshot for the coach (Claude Code reads this); not a config file
    ["context.json", JSON.stringify(buildCoachContext(), null, 2)],
  ];
  // Only write files whose content actually changed since our last write. A store change
  // that doesn't touch a given file (e.g. ephemeral toast/day churn) must NOT rewrite it —
  // otherwise it can overwrite, and clobber, an external edit (the coach's) sitting on disk.
  const changed = all.filter(([file, json]) => lastWritten[file] !== json);
  await Promise.all(
    changed.map(async ([file, json]) => {
      await writeTextFile(await join(dir, file), json);
      lastWritten[file] = json;
    }),
  );
  if (changed.length) lastWrite = Date.now();
  writePending = false;
}

async function readJSON(file: string): Promise<any | null> {
  const path = await join(dir, file);
  if (!(await exists(path))) return null;
  try {
    return JSON.parse(await readTextFile(path));
  } catch {
    return null; // a malformed hand-edit shouldn't crash the app
  }
}

/** Build a partial store patch from whatever files exist (missing → untouched). */
async function readAll(): Promise<Partial<State>> {
  const patch: Record<string, unknown> = {};
  const s = await readJSON(FILES.settings);
  if (s) {
    if (s.settings) patch.settings = s.settings;
    if (s.theme) patch.theme = s.theme;
    if (typeof s.panelEnabled === "boolean") patch.panelEnabled = s.panelEnabled;
    if (typeof s.notificationsEnabled === "boolean") patch.notificationsEnabled = s.notificationsEnabled;
    if (typeof s.snoozeMinutes === "number") patch.snoozeMinutes = s.snoozeMinutes;
    if (typeof s.demoMode === "boolean") patch.demoMode = s.demoMode;
  }
  const r = await readJSON(FILES.routine);
  if (r) {
    if (Array.isArray(r.dayTypes)) patch.dayTypes = r.dayTypes;
    if (Array.isArray(r.week)) patch.week = r.week;
    if (Array.isArray(r.dayKind)) patch.dayKind = r.dayKind;
    if (r.dayOverrides && typeof r.dayOverrides === "object" && !Array.isArray(r.dayOverrides))
      patch.dayOverrides = r.dayOverrides;
  }
  const eq = await readJSON(FILES.equipment);
  if (eq) {
    if (Array.isArray(eq.owned)) patch.ownedEquipment = eq.owned;
    if (Array.isArray(eq.custom)) patch.customEquipment = eq.custom;
  }
  const ex = await readJSON(FILES.exercises);
  if (ex && Array.isArray(ex.custom)) patch.customExercises = ex.custom;
  const profile = await readJSON(FILES.profile);
  if (profile && typeof profile === "object") patch.profile = profile;
  const coach = await readJSON(FILES.coach);
  if (coach && typeof coach === "object") patch.coach = coach;
  const logs = await readJSON(FILES.logs);
  if (Array.isArray(logs)) patch.logs = logs;
  return patch as Partial<State>;
}

type DayTypeLike = { id: string; name: string; routine: unknown[] };
const isDayType = (d: any): d is DayTypeLike =>
  d && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.routine);

const MUSCLES = new Set(["pull", "push", "core", "legs"]);
const isVariant = (v: any) => v && typeof v.id === "string" && typeof v.label === "string";
/** A custom exercise the catalog can render safely — id/name/muscle/axis are load-bearing. */
const isExercise = (e: any): boolean =>
  !!e &&
  typeof e.id === "string" &&
  typeof e.name === "string" &&
  MUSCLES.has(e.muscle) &&
  Array.isArray(e.equipment) &&
  typeof e.defaultReps === "string" &&
  typeof e.defaultSets === "number" &&
  Array.isArray(e.axis) &&
  e.axis.length > 0 &&
  e.axis.every(isVariant);

/**
 * Guarantee config invariants so a bad hand-edit (yours, mine, or the coach's)
 * can't crash the app: at least one dayType, and week/dayKind length 7 with valid
 * slots. An edit that would violate these is corrected or ignored, not applied.
 */
function sanitize(patch: Partial<State>): Partial<State> {
  const cur = useStore.getState();
  const out = { ...patch } as Record<string, unknown>;

  if (out.dayTypes !== undefined) {
    const dts = Array.isArray(out.dayTypes) ? (out.dayTypes as any[]).filter(isDayType) : [];
    if (dts.length === 0) delete out.dayTypes; // never empty dayTypes — keep current
    else out.dayTypes = dts;
  }
  const dayTypes = (out.dayTypes as DayTypeLike[] | undefined) ?? cur.dayTypes;
  const fallbackId = dayTypes[0]?.id ?? "default";
  const valid = new Set<string>([...dayTypes.map((d) => d.id), REST]);

  if (out.week !== undefined) {
    const w = Array.isArray(out.week) ? (out.week as any[]) : [];
    out.week = Array.from({ length: 7 }, (_, i) => (valid.has(w[i]) ? w[i] : fallbackId));
  }
  if (out.dayKind !== undefined) {
    const k = Array.isArray(out.dayKind) ? (out.dayKind as any[]) : [];
    out.dayKind = Array.from({ length: 7 }, (_, i) =>
      k[i] === "home" || k[i] === "office" ? k[i] : null,
    );
  }
  if (out.dayOverrides !== undefined) {
    const src = (out.dayOverrides ?? {}) as Record<string, any>;
    const clean: Record<string, { slot: string; kind: "home" | "office" | null }> = {};
    for (const [date, o] of Object.entries(src)) {
      if (!o || typeof o !== "object" || !valid.has(o.slot)) continue;
      clean[date] = { slot: o.slot, kind: o.kind === "home" || o.kind === "office" ? o.kind : null };
    }
    out.dayOverrides = clean;
  }
  // Custom exercises: drop any malformed entry so a bad edit can't break the catalog
  // (the rest of the app reads .muscle/.axis/.equipment on these without guarding).
  if (out.customExercises !== undefined) {
    out.customExercises = Array.isArray(out.customExercises)
      ? (out.customExercises as any[]).filter(isExercise)
      : cur.customExercises;
  }
  for (const key of ["ownedEquipment", "customEquipment", "logs"] as const) {
    if (out[key] !== undefined && !Array.isArray(out[key])) delete out[key];
  }
  return out as Partial<State>;
}

/** Apply files to the store, then recompute today + re-apply theme. */
async function loadIntoStore(): Promise<void> {
  const patch = sanitize(await readAll());
  suppress = true;
  useStore.setState(patch);
  suppress = false;
  const { theme, replan } = useStore.getState();
  applyTheme(theme.mode, theme.accent);
  replan();
}

/** Pull external edits in — but only when the disk actually differs from the
 *  store, and never while our own write is pending (which would revert it). */
async function reconcile(): Promise<void> {
  if (suppress || writePending || Date.now() - lastWrite < 1000) return;
  const g = groups(useStore.getState());
  for (const [file, data] of Object.entries(g)) {
    const onDisk = await readJSON(file);
    if (onDisk !== null && JSON.stringify(onDisk) !== JSON.stringify(data)) {
      await loadIntoStore();
      return;
    }
  }
}

/** Manually re-read the config files into the store (e.g. a "reload" button). */
export async function reloadFromFiles(): Promise<void> {
  if (dir) await loadIntoStore();
}

export async function setupFileSync(): Promise<void> {
  try {
    dir = await appConfigDir();
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });

    // Brief a Claude Code run in this folder as the coach (focused workspace). Refresh it
    // when the template changes, but don't rewrite an identical file on every boot.
    const claudeMdPath = await join(dir, "CLAUDE.md");
    if (!(await exists(claudeMdPath)) || (await readTextFile(claudeMdPath)) !== COACH_CLAUDE_MD) {
      await writeTextFile(claudeMdPath, COACH_CLAUDE_MD);
    }

    if (await exists(await join(dir, FILES.settings))) {
      await loadIntoStore(); // files win on startup
    } else {
      await writeAll(); // first run: seed files from current (migrated) state
    }

    // store -> files (debounced); guard reconcile until the write lands
    useStore.subscribe(() => {
      if (suppress) return;
      writePending = true;
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => void writeAll(), 300);
    });

    // reliable: poll for external edits
    setInterval(() => void reconcile(), POLL_MS);

    // instant where supported: filesystem watch (best-effort)
    try {
      await watchImmediate(dir, () => void reconcile(), { recursive: false });
    } catch {
      // watching unsupported here — polling covers it.
    }
  } catch {
    // Not in Tauri or fs unavailable — fall back to localStorage only.
  }
}
