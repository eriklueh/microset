/**
 * Módulo ENTRENO (nuevo — sesiones estructuradas multi-modalidad + reprogramación
 * adaptativa cross-día). See docs/VISION.md §5.
 *
 * INCREMENTO 2a · NÚCLEO PURO: model + `contribute()` + a `Schedulable` mapper + the
 * motive-aware adaptive planner. Everything here is pure TypeScript — no React, no Tauri,
 * no store. It reuses the kernel contracts and the shared per-set XP primitive so a
 * structured Entreno session and a Pausa micro-set stamp the SAME muscle attributes.
 *
 * Net-new module, default OFF: importing this file only registers the manifest; nothing
 * in the running app reads it yet. With Entreno disabled the app behaves exactly as today.
 *
 * The planner is a DERIVED projection that only *seeds* a day's plan — the engine stays
 * pure and day-bounded. Its job is to turn a missed session + a reason into a concrete,
 * deterministic adaptation (rest / mobility / a home calisthenics substitution circuit).
 */
import type { BodyGroup } from "@/domain/bodyGroups";
import { BODY_GROUPS, exerciseGroupRoles } from "@/domain/bodyGroups";
import { isAvailable, defaultVariantId } from "@/domain/seed";
import { intrinsicSetMetrics } from "@/domain/setContribution";
import type { Exercise, EquipmentId } from "@/domain/types";
import type { RoutineItem } from "@/lib/engine";
import {
  registerModule,
  SELF,
  type ActivityEvent,
  type ActivityMetrics,
  type ContributeContext,
  type ModuleManifest,
  type Schedulable,
} from "@/kernel";

// ─────────────────────────────────────────────────────────────────────────────
// MODEL
// ─────────────────────────────────────────────────────────────────────────────

/** What kind of training a session is. Drives contribution + how it can be substituted. */
export type Modality = "calisthenics" | "strength" | "sport" | "cardio";

/** Where the session happens. "away" (gym/dojo) can't be substituted in place. */
export type SessionLocation = "home" | "away";

interface SessionBase {
  id: string;
  modality: Modality;
  location: SessionLocation;
  /** Optional user-facing name (e.g. "BJJ"); UIs fall back to modality · location. */
  name?: string;
  /** Bounding window (minutes-of-day) for windowed/clustered placement. */
  window?: { start: number; end: number };
  /** Tiebreak for ordering within a day (lower = earlier). */
  priority?: number;
}

/**
 * A STRUCTURED session: logs series. Its prescription reuses the shared catalog via
 * `RoutineItem`s (same shape Pausa/the engine already use), so the same XP model applies.
 */
export interface StructuredSession extends SessionBase {
  external: false;
  items: RoutineItem[];
}

/**
 * An EXTERNAL session (e.g. BJJ): you don't log series, you log that it happened +
 * duration + subjective intensity. Effort is derived from duration × intensity.
 */
export interface ExternalSession extends SessionBase {
  external: true;
  /** Planned duration in minutes. */
  durationMin: number;
  /** Subjective intensity, 0..1. */
  intensity: number;
}

export type Session = StructuredSession | ExternalSession;
export type SessionTemplate = Session;

// ─────────────────────────────────────────────────────────────────────────────
// EVENT KINDS + PAYLOADS
// ─────────────────────────────────────────────────────────────────────────────

export const ENTRENO_SESSION_DONE = "entreno.session.done";
export const ENTRENO_SESSION_SKIPPED = "entreno.session.skipped";

/** A single logged series inside a structured session. */
export interface EntrenoSetLog {
  exerciseId: string;
  variantId?: string;
}

export interface EntrenoStructuredDonePayload {
  sessionId: string;
  modality: Modality;
  external: false;
  /** The series actually performed. */
  sets: EntrenoSetLog[];
  /** Optional wall-clock duration of the session. */
  durationMin?: number;
}

export interface EntrenoExternalDonePayload {
  sessionId: string;
  modality: Modality;
  external: true;
  durationMin: number;
  /** 0..1. */
  intensity: number;
}

export type EntrenoDonePayload = EntrenoStructuredDonePayload | EntrenoExternalDonePayload;

/** Why a session was skipped — the motive DRIVES the adaptive planner. */
export type SkipReason = "enfermo" | "lesionado" | "ocupado" | "viajando";

export interface EntrenoSkippedPayload {
  sessionId: string;
  reason: SkipReason;
}

// ─────────────────────────────────────────────────────────────────────────────
// contribute() — payload → metrics envelope
// ─────────────────────────────────────────────────────────────────────────────

/** Effort per minute of external work at intensity=1 (a 60' session @0.8 ≈ 4.8 effortXp,
 *  the ballpark of a ~10-set structured session). */
export const EXTERNAL_EFFORT_PER_MIN = 0.1;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Map a `entreno.session.done` payload to the kernel metrics envelope.
 * - STRUCTURED: reuse `intrinsicSetMetrics` per series (same XP as Pausa) → effortXp +
 *   per-group muscleXp + volumeLoad (series count) + optional durationMin.
 * - EXTERNAL/sport: derive effortXp + durationMin from duration × intensity (no muscleXp,
 *   since no series are logged).
 * Day-intensity and the per-group soft-cap stay in the gamification projection.
 */
export function entrenoContribute(
  payload: EntrenoDonePayload,
  ctx: ContributeContext,
): ActivityMetrics | undefined {
  if (payload.external) {
    const durationMin = Math.max(0, payload.durationMin);
    const effortXp = round2(durationMin * clamp01(payload.intensity) * EXTERNAL_EFFORT_PER_MIN);
    return { effortXp, durationMin };
  }

  const muscleXp: Partial<Record<BodyGroup, number>> = {};
  let effortXp = 0;
  let volumeLoad = 0;
  for (const s of payload.sets) {
    const ex = ctx.exercise(s.exerciseId);
    if (!ex) continue;
    const m = intrinsicSetMetrics(ex, s.variantId);
    effortXp += m.effortXp;
    for (const g of Object.keys(m.muscleXp) as BodyGroup[]) {
      muscleXp[g] = (muscleXp[g] ?? 0) + (m.muscleXp[g] ?? 0);
    }
    volumeLoad += 1;
  }
  if (volumeLoad === 0) return undefined;
  const metrics: ActivityMetrics = { effortXp, muscleXp, volumeLoad };
  if (payload.durationMin != null) metrics.durationMin = Math.max(0, payload.durationMin);
  return metrics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedulable mapper (windowed / clustered mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turn a session into a kernel `Schedulable` for a given `date` (`YYYY-M-D`). A session is
 * placed in windowed/clustered mode: unplaced (`time:null`) inside its optional `window`,
 * with `earliest` seeded to the window start so the same day-bounded engine can slot it.
 */
export function sessionToSchedulable(session: Session, date: string): Schedulable {
  const s: Schedulable = {
    date,
    time: null,
    status: "pending",
  };
  if (session.window) {
    s.window = session.window;
    s.earliest = session.window.start;
  }
  if (session.priority != null) s.priority = session.priority;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTIVE-AWARE ADAPTIVE PLANNER
// ─────────────────────────────────────────────────────────────────────────────

export type AdaptationKind = "rest" | "mobility" | "substitute";

export interface Adaptation {
  kind: AdaptationKind;
  reason: SkipReason;
  /** Whether the adaptation prescribes any training load. FALSE for rest/mobility
   *  (explicitly no compensatory volume), TRUE for a substitution circuit. */
  addsLoad: boolean;
  /** For substitution: a home calisthenics circuit covering the missed CONDITIONING.
   *  Empty for rest/mobility. */
  circuit: RoutineItem[];
  /** For a sport session: the skill part is intentionally NOT substituted. */
  skillDropped: boolean;
  /** ES copy explaining the move. */
  note: string;
}

/** Small injected context (never imported from the store). */
export interface AdaptContext {
  /** Catalog resolver by id. */
  byId: (id: string) => Exercise | undefined;
  /** The catalog to choose substitution exercises from. */
  catalog: Exercise[];
  /** Equipment owned (defines what's doable at home). */
  owned: EquipmentId[];
  /** Optional recent per-group load — the planner biases away from recently-hit groups. */
  recentLoad?: Partial<Record<BodyGroup, number>>;
  /** Volume cap: max total series in a substitution circuit. */
  maxSubSets?: number;
}

const DEFAULT_MAX_SUB_SETS = 12;
const SETS_PER_EXERCISE = 3;

/** General full-body conditioning template (used when the missed session carries no series). */
const CONDITIONING_TEMPLATE: BodyGroup[] = ["legs", "core", "back", "chest", "shoulders", "arms"];

/** The conditioning body-groups a session covers (structured: from its items; external: template). */
function sessionConditioningGroups(session: Session, byId: (id: string) => Exercise | undefined): BodyGroup[] {
  if (session.external) return CONDITIONING_TEMPLATE;
  const hit = new Set<BodyGroup>();
  for (const it of session.items) {
    const ex = byId(it.exerciseId);
    if (!ex) continue;
    for (const g of exerciseGroupRoles(ex).primary) hit.add(g);
  }
  return BODY_GROUPS.filter((g) => hit.has(g));
}

/**
 * Build a deterministic home calisthenics circuit covering `targetGroups`, respecting a
 * volume cap and (if provided) recent load. Only exercises whose equipment the user owns
 * are eligible. Groups are visited least-recently-worked-first (stable by template order),
 * one exercise per group, until the cap is hit.
 */
function buildHomeCircuit(targetGroups: BodyGroup[], ctx: AdaptContext): RoutineItem[] {
  const maxSets = ctx.maxSubSets ?? DEFAULT_MAX_SUB_SETS;
  const recent = ctx.recentLoad ?? {};
  const templateIdx = (g: BodyGroup): number => {
    const i = CONDITIONING_TEMPLATE.indexOf(g);
    return i === -1 ? CONDITIONING_TEMPLATE.length : i;
  };
  // Least recently worked first; ties broken by the template order for determinism.
  const ordered = [...targetGroups].sort((a, b) => {
    const ra = recent[a] ?? 0;
    const rb = recent[b] ?? 0;
    if (ra !== rb) return ra - rb;
    return templateIdx(a) - templateIdx(b);
  });
  // Deterministic candidate pool: available (owned) exercises, sorted by id.
  const available = ctx.catalog
    .filter((e) => isAvailable(e, ctx.owned))
    .sort((a, b) => a.id.localeCompare(b.id));

  const items: RoutineItem[] = [];
  const used = new Set<string>();
  let total = 0;
  for (const g of ordered) {
    if (total + SETS_PER_EXERCISE > maxSets) break;
    const ex = available.find((e) => !used.has(e.id) && exerciseGroupRoles(e).primary.includes(g));
    if (!ex) continue;
    used.add(ex.id);
    items.push({
      exerciseId: ex.id,
      name: ex.name,
      sets: SETS_PER_EXERCISE,
      variantId: defaultVariantId(ex),
      priority: 0,
    });
    total += SETS_PER_EXERCISE;
  }
  return items;
}

const REST_NOTE =
  "Enfermo: descanso hoy. La recuperación es la prioridad — sin volumen compensatorio.";
const MOBILITY_NOTE =
  "Lesionado: movilidad liviana, sin carga. Sin volumen compensatorio para no agravar.";
const SUB_NOTE_HOME = "Circuito de calistenia en casa para cubrir el acondicionamiento de la sesión.";
const SUB_NOTE_SKILL = " La parte de skill del deporte no se sustituye.";

/**
 * The key piece: a pure, deterministic planner that reacts to WHY a session was missed.
 * - `enfermo`  → rest      (no compensatory volume).
 * - `lesionado`→ mobility  (light, no load; no compensatory volume).
 * - `ocupado` / `viajando` → substitute the trainable conditioning with a home calisthenics
 *    circuit read from the catalog (respecting owned equipment, a volume cap and recent load).
 *    For a sport session the skill part is deliberately NOT substituted.
 */
export function adaptMissedSession(session: Session, reason: SkipReason, ctx: AdaptContext): Adaptation {
  if (reason === "enfermo" || reason === "lesionado") {
    const isSick = reason === "enfermo";
    return {
      kind: isSick ? "rest" : "mobility",
      reason,
      addsLoad: false,
      circuit: [],
      skillDropped: false,
      note: isSick ? REST_NOTE : MOBILITY_NOTE,
    };
  }

  // ocupado | viajando → substitute the conditioning at home.
  const groups = sessionConditioningGroups(session, ctx.byId);
  const circuit = buildHomeCircuit(groups, ctx);
  const skillDropped = session.modality === "sport";
  return {
    kind: "substitute",
    reason,
    addsLoad: true,
    circuit,
    skillDropped,
    note: SUB_NOTE_HOME + (skillDropped ? SUB_NOTE_SKILL : ""),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MANIFEST (net-new module, default OFF)
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic, idempotent event id for a completed session. */
export function sessionDoneEventId(payload: EntrenoDonePayload, at: string): string {
  return `entreno:session:done:${payload.sessionId}:${at}`;
}

export const entrenoManifest: ModuleManifest = {
  id: "entreno",
  fileGroup: "sessions",
  toolNamespace: "entreno",
  sync: "derived-only",
  shareable: true,
  scoredInLeague: true,
  defaultEnabled: false,
  contribute: (event: ActivityEvent, ctx: ContributeContext) => {
    if (event.kind !== ENTRENO_SESSION_DONE) return undefined;
    return entrenoContribute(event.payload as EntrenoDonePayload, ctx);
  },
};

registerModule(entrenoManifest);

/** Wrap a done payload into a kernel ActivityEvent (deterministic id, self-owned). */
export function sessionDoneToEvent(
  payload: EntrenoDonePayload,
  at: string,
  ctx: ContributeContext,
): ActivityEvent<EntrenoDonePayload> {
  return {
    id: sessionDoneEventId(payload, at),
    at,
    module: "entreno",
    kind: ENTRENO_SESSION_DONE,
    personId: SELF,
    v: 1,
    payload,
    metrics: entrenoContribute(payload, ctx),
  };
}
