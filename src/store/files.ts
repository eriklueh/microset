import { appConfigDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, watchImmediate, writeTextFile } from "@tauri-apps/plugin-fs";
import { applyTheme } from "@/lib/theme";
import { buildCoachContext } from "@/coach/context";
import { COACH_CLAUDE_MD } from "@/coach/workspace";
import { REST, useStore } from "./useStore";
import {
  sanitizeEntreno,
  sanitizeEquipment,
  sanitizeExercises,
  sanitizeLogs,
  sanitizeRoutine,
} from "./sanitize";

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

// The pure config validators + per-group sanitizers live in ./sanitize (no
// @tauri-apps/DOM/React/zustand) so the Convex backend can reuse them verbatim.

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
      modules: s.modules,
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
        // Module registry (which modules are enabled) — editable from disk so the coach/config
        // can turn a module on/off. Reads guard with `?.enabled`, so a partial map is safe.
        if (s.modules && typeof s.modules === "object" && !Array.isArray(s.modules)) p.modules = s.modules;
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
    sanitize: (out, cur) => sanitizeRoutine(out, cur, REST),
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
    sanitize: (out) => sanitizeEquipment(out),
  },
  {
    name: "exercises.json",
    select: (s) => ({ custom: s.customExercises }),
    apply: (ex) => (ex && Array.isArray(ex.custom) ? ({ customExercises: ex.custom } as Partial<State>) : {}),
    // Custom exercises: drop any malformed entry so a bad edit can't break the catalog
    // (the rest of the app reads .muscle/.axis/.equipment on these without guarding).
    sanitize: (out, cur) => sanitizeExercises(out, cur),
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
    sanitize: (out) => sanitizeLogs(out),
  },
  {
    // Entreno module (net-new). Owns the training sessions, weekly program and outcome log.
    // Dormant while the module is disabled, but its config still round-trips to disk.
    name: "entreno.json",
    select: (s) => s.entreno,
    apply: (e) =>
      e && typeof e === "object" && !Array.isArray(e) ? ({ entreno: e } as Partial<State>) : {},
    // Defensive: drop malformed sessions/records, keep week length 7 with valid sessionIds.
    sanitize: (out, cur) => sanitizeEntreno(out, cur),
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
