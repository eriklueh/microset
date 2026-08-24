/**
 * Pure config validators + file-group sanitizers.
 *
 * This module is intentionally FRAMEWORK-FREE: no @tauri-apps, no React, no
 * zustand, no DOM — only types (imported `import type`, erased at runtime) and
 * pure logic. That lets the Convex backend (V8, no Node/Tauri) reuse the exact
 * same guards the app uses on disk, so a config edit is validated identically
 * everywhere. The I/O (read/write of the JSON files) stays in `files.ts`.
 *
 * Each `sanitize*` function guards one file-group's invariants IN PLACE on the
 * merged patch: a bad hand-edit (yours, mine, or the coach's) is corrected or
 * ignored, never applied. They touch disjoint keys, so order is irrelevant.
 */

// Type-only: erased at compile time, so no runtime dependency on the store
// (and thus none on zustand / Tauri / DOM) leaks into this pure module.
import type { useStore } from "./useStore";

type State = ReturnType<typeof useStore.getState>;

// --- config validation helpers (used by the file-group sanitizers) ---------

export type DayTypeLike = { id: string; name: string; routine: unknown[] };
export const isDayType = (d: any): d is DayTypeLike =>
  d && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.routine);

const MUSCLES = new Set(["pull", "push", "core", "legs"]);
export const isVariant = (v: any) => v && typeof v.id === "string" && typeof v.label === "string";
/** A custom exercise the catalog can render safely — id/name/muscle/axis are load-bearing. */
export const isExercise = (e: any): boolean =>
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
export const isSessionItem = (it: any): boolean =>
  it && typeof it.exerciseId === "string" && typeof it.name === "string" && typeof it.sets === "number";
/** A training session on disk — narrows the structured/external union defensively. */
export const isSession = (s: any): boolean => {
  if (!s || typeof s.id !== "string" || !MODALITIES.has(s.modality) || !LOCATIONS.has(s.location)) return false;
  return s.external === true
    ? typeof s.durationMin === "number" && typeof s.intensity === "number"
    : s.external === false && Array.isArray(s.items);
};
/** A logged outcome record (done/skipped, with a valid motive when skipped). */
export const isEntrenoRecord = (r: any): boolean =>
  r &&
  typeof r.id === "string" &&
  typeof r.sessionId === "string" &&
  typeof r.date === "string" &&
  typeof r.at === "string" &&
  (r.status === "done" || (r.status === "skipped" && SKIP_REASONS.has(r.reason)));

// --- file-group sanitizers (pure; operate in place on the merged patch) -----

/**
 * routine.json: at least one dayType, and week/dayKind length 7 with valid slots.
 * `rest` is the rest-day sentinel (passed in so this module needs no store runtime).
 */
export function sanitizeRoutine(out: Record<string, unknown>, cur: State, rest: string): void {
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
  const valid = new Set<string>([...dayTypes.map((d) => d.id), rest]);

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
}

/** equipment.json: owned/custom must be arrays (drop a wrong-typed edit). */
export function sanitizeEquipment(out: Record<string, unknown>): void {
  for (const key of ["ownedEquipment", "customEquipment"] as const) {
    if (out[key] !== undefined && !Array.isArray(out[key])) delete out[key];
  }
}

/**
 * exercises.json: drop any malformed custom exercise so a bad edit can't break
 * the catalog (the rest of the app reads .muscle/.axis/.equipment unguarded).
 */
export function sanitizeExercises(out: Record<string, unknown>, cur: State): void {
  if (out.customExercises !== undefined) {
    out.customExercises = Array.isArray(out.customExercises)
      ? (out.customExercises as any[]).filter(isExercise)
      : cur.customExercises;
  }
}

/** logs.json: logs must be an array (drop a wrong-typed edit). */
export function sanitizeLogs(out: Record<string, unknown>): void {
  if (out.logs !== undefined && !Array.isArray(out.logs)) delete out.logs;
}

/**
 * entreno.json: drop malformed sessions/records, keep week length 7 with valid
 * sessionIds.
 */
export function sanitizeEntreno(out: Record<string, unknown>, cur: State): void {
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
}
