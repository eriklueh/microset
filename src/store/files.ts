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

const POLL_MS = 2000;

let dir = "";
let suppress = false; // applying disk -> store (ignore the resulting writes)
let writePending = false; // a store -> disk write is queued/in-flight
let lastWrite = 0; // when we last wrote, to avoid reconciling stale disk
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastWritten: Record<string, string> = {}; // file -> last JSON we wrote (skip unchanged)

type State = ReturnType<typeof useStore.getState>;

// --- config validation helpers (used by the file-group sanitizers) ---------

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

// --- entreno module config validation --------------------------------------
const MODALITIES = new Set(["calisthenics", "strength", "sport", "cardio"]);
const LOCATIONS = new Set(["home", "away"]);
const SKIP_REASONS = new Set(["enfermo", "lesionado", "ocupado", "viajando"]);
/** A routine item inside a structured session (only id/name/sets are load-bearing). */
const isSessionItem = (it: any): boolean =>
  it && typeof it.exerciseId === "string" && typeof it.name === "string" && typeof it.sets === "number";
/** A training session on disk — narrows the structured/external union defensively. */
const isSession = (s: any): boolean => {
  if (!s || typeof s.id !== "string" || !MODALITIES.has(s.modality) || !LOCATIONS.has(s.location)) return false;
  return s.external === true
    ? typeof s.durationMin === "number" && typeof s.intensity === "number"
    : s.external === false && Array.isArray(s.items);
};
/** A logged outcome record (done/skipped, with a valid motive when skipped). */
const isEntrenoRecord = (r: any): boolean =>
  r &&
  typeof r.id === "string" &&
  typeof r.sessionId === "string" &&
  typeof r.date === "string" &&
  typeof r.at === "string" &&
  (r.status === "done" || (r.status === "skipped" && SKIP_REASONS.has(r.reason)));

/**
 * A module's file-group: one JSON file on disk plus how to move it to/from the store.
 *  - select:   store state -> the object written to `name`.
 *  - apply:    a parsed file -> the partial store patch it contributes (missing/typed-wrong → skipped).
 *  - sanitize: guard this group's config invariants in-place on the merged patch (a bad hand-edit
 *              — yours, mine, or the coach's — is corrected or ignored, never applied).
 *  - readonly: written for the coach to read, never read back into the store (excluded from
 *              load/reconcile). Everything else round-trips.
 * The write-only-changed / watch / reconcile loop below is generic: it just iterates this registry.
 */
interface FileGroup {
  name: string;
  select: (s: State) => unknown;
  apply?: (data: any) => Partial<State>;
  sanitize?: (out: Record<string, unknown>, cur: State) => void;
  readonly?: boolean;
}

const REGISTRY: FileGroup[] = [
  {
    name: "settings.json",
    select: (s) => ({
      settings: s.settings,
      theme: s.theme,
      panelEnabled: s.panelEnabled,
      notificationsEnabled: s.notificationsEnabled,
      snoozeMinutes: s.snoozeMinutes,
      demoMode: s.demoMode,
      levelsEnabled: s.levelsEnabled,
      streakFreeze: s.streakFreeze,
    }),
    apply: (s) => {
      const p: Record<string, unknown> = {};
      if (s) {
        if (s.settings) p.settings = s.settings;
        if (s.theme) p.theme = s.theme;
        if (typeof s.panelEnabled === "boolean") p.panelEnabled = s.panelEnabled;
        if (typeof s.notificationsEnabled === "boolean") p.notificationsEnabled = s.notificationsEnabled;
        if (typeof s.snoozeMinutes === "number") p.snoozeMinutes = s.snoozeMinutes;
        if (typeof s.demoMode === "boolean") p.demoMode = s.demoMode;
        if (typeof s.levelsEnabled === "boolean") p.levelsEnabled = s.levelsEnabled;
        if (typeof s.streakFreeze === "boolean") p.streakFreeze = s.streakFreeze;
      }
      return p as Partial<State>;
    },
  },
  {
    name: "routine.json",
    select: (s) => ({ dayTypes: s.dayTypes, week: s.week, dayKind: s.dayKind, dayOverrides: s.dayOverrides }),
    apply: (r) => {
      const p: Record<string, unknown> = {};
      if (r) {
        if (Array.isArray(r.dayTypes)) p.dayTypes = r.dayTypes;
        if (Array.isArray(r.week)) p.week = r.week;
        if (Array.isArray(r.dayKind)) p.dayKind = r.dayKind;
        if (r.dayOverrides && typeof r.dayOverrides === "object" && !Array.isArray(r.dayOverrides))
          p.dayOverrides = r.dayOverrides;
      }
      return p as Partial<State>;
    },
    // Guarantee: at least one dayType, and week/dayKind length 7 with valid slots.
    sanitize: (out, cur) => {
      if (out.dayTypes !== undefined) {
        const dts = Array.isArray(out.dayTypes) ? (out.dayTypes as any[]).filter(isDayType) : [];
        if (dts.length === 0) delete out.dayTypes; // never empty dayTypes — keep current
        else
          out.dayTypes = dts.map((d: any) => {
            const c = { ...d };
            // strip a malformed per-day schedule override so it can't break createDayPlan
            if (!(c.window && typeof c.window.start === "number" && typeof c.window.end === "number")) delete c.window;
            if (typeof c.minRest !== "number") delete c.minRest;
            return c;
          });
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
    },
  },
  {
    name: "equipment.json",
    select: (s) => ({ owned: s.ownedEquipment, custom: s.customEquipment }),
    apply: (eq) => {
      const p: Record<string, unknown> = {};
      if (eq) {
        if (Array.isArray(eq.owned)) p.ownedEquipment = eq.owned;
        if (Array.isArray(eq.custom)) p.customEquipment = eq.custom;
      }
      return p as Partial<State>;
    },
    sanitize: (out) => {
      for (const key of ["ownedEquipment", "customEquipment"] as const) {
        if (out[key] !== undefined && !Array.isArray(out[key])) delete out[key];
      }
    },
  },
  {
    name: "exercises.json",
    select: (s) => ({ custom: s.customExercises }),
    apply: (ex) => (ex && Array.isArray(ex.custom) ? ({ customExercises: ex.custom } as Partial<State>) : {}),
    // Custom exercises: drop any malformed entry so a bad edit can't break the catalog
    // (the rest of the app reads .muscle/.axis/.equipment on these without guarding).
    sanitize: (out, cur) => {
      if (out.customExercises !== undefined) {
        out.customExercises = Array.isArray(out.customExercises)
          ? (out.customExercises as any[]).filter(isExercise)
          : cur.customExercises;
      }
    },
  },
  {
    name: "profile.json",
    select: (s) => s.profile,
    apply: (profile) =>
      profile && typeof profile === "object" ? ({ profile } as Partial<State>) : {},
  },
  {
    name: "coach.json",
    select: (s) => s.coach,
    apply: (coach) => (coach && typeof coach === "object" ? ({ coach } as Partial<State>) : {}),
  },
  {
    name: "logs.json",
    select: (s) => s.logs,
    apply: (logs) => (Array.isArray(logs) ? ({ logs } as Partial<State>) : {}),
    sanitize: (out) => {
      if (out.logs !== undefined && !Array.isArray(out.logs)) delete out.logs;
    },
  },
  {
    // Entreno module (net-new). Owns the training sessions, weekly program and outcome log.
    // Dormant while the module is disabled, but its config still round-trips to disk.
    name: "entreno.json",
    select: (s) => s.entreno,
    apply: (e) =>
      e && typeof e === "object" && !Array.isArray(e) ? ({ entreno: e } as Partial<State>) : {},
    // Defensive: drop malformed sessions/records, keep week length 7 with valid sessionIds.
    sanitize: (out, cur) => {
      if (out.entreno === undefined) return;
      const e = out.entreno as any;
      if (!e || typeof e !== "object" || Array.isArray(e)) {
        out.entreno = cur.entreno;
        return;
      }
      const sessions = Array.isArray(e.sessions)
        ? (e.sessions as any[]).filter(isSession).map((s: any) => (s.external ? s : { ...s, items: (s.items as any[]).filter(isSessionItem) }))
        : [];
      const ids = new Set<string>(sessions.map((s: any) => s.id));
      const week = Array.from({ length: 7 }, (_, i) => {
        const w = Array.isArray(e.week) ? e.week[i] : null;
        return typeof w === "string" && ids.has(w) ? w : null;
      });
      const records = Array.isArray(e.records)
        ? (e.records as any[]).filter((r) => isEntrenoRecord(r) && ids.has(r.sessionId))
        : [];
      out.entreno = { sessions, week, records };
    },
  },
  {
    // read-only snapshot for the coach (Claude Code reads this); not a config file
    name: "context.json",
    select: () => buildCoachContext(),
    readonly: true,
  },
];

/** The groups that round-trip (written and read back); excludes read-only snapshots. */
const CONFIG_GROUPS = REGISTRY.filter((g) => !g.readonly);

async function writeAll(): Promise<void> {
  const s = useStore.getState();
  const all: [string, string][] = REGISTRY.map(
    (g) => [g.name, JSON.stringify(g.select(s), null, 2)] as [string, string],
  );
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
  for (const g of CONFIG_GROUPS) {
    if (!g.apply) continue;
    Object.assign(patch, g.apply(await readJSON(g.name)));
  }
  return patch as Partial<State>;
}

/**
 * Guarantee config invariants so a bad hand-edit (yours, mine, or the coach's)
 * can't crash the app. Each group's sanitizer corrects or ignores its own fields;
 * they touch disjoint keys, so the merged result is independent of order.
 */
function sanitize(patch: Partial<State>): Partial<State> {
  const cur = useStore.getState();
  const out = { ...patch } as Record<string, unknown>;
  for (const g of CONFIG_GROUPS) g.sanitize?.(out, cur);
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
  const s = useStore.getState();
  for (const g of CONFIG_GROUPS) {
    const onDisk = await readJSON(g.name);
    if (onDisk !== null && JSON.stringify(onDisk) !== JSON.stringify(g.select(s))) {
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

    if (await exists(await join(dir, "settings.json"))) {
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
