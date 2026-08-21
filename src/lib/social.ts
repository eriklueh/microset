/**
 * Social layer · pure helpers (F4 — capa social, ver docs/VISION.md §6).
 *
 * The league resets every ISO week. The season key is derived CLIENT-SIDE from the local
 * calendar so there is no server clock to trust and no extra state to persist — every
 * device agrees on the same "AAAA-Wnn" bucket for a given day.
 */
import type { IntensityId } from "@/domain/intensity";

/** Thursday (local midnight) of the ISO week that `x` falls in. ISO 8601 anchors a week's
 *  year on its Thursday, so this single move makes both the year and the week deterministic. */
function isoThursday(x: Date): Date {
  const t = new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dow = (t.getDay() + 6) % 7; // Mon=0 … Sun=6
  t.setDate(t.getDate() - dow + 3); // step to Thursday of this week
  return t;
}

/**
 * The current league season key as `AAAA-Wnn` (ISO 8601 week-numbering year + zero-padded
 * week), computed in LOCAL time. E.g. `2026-W34`. Deterministic and side-effect-free.
 */
export function currentSeasonId(d: Date = new Date()): string {
  const target = isoThursday(d);
  const isoYear = target.getFullYear();
  // Jan 4 is always in ISO week 1; its Thursday anchors week 1 of the ISO year.
  const week1Thursday = isoThursday(new Date(isoYear, 0, 4));
  const week = 1 + Math.round((target.getTime() - week1Thursday.getTime()) / 604_800_000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Canonical `YYYY-M-D` day key (matches the store's todayKey / dateKey) in LOCAL time. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ── Compartir rutinas ───────────────────────────────────────────────────────────
// A shared routine travels as the JSON of a day-type WITHOUT its local id (the copier
// mints a fresh one). Convex treats the payload as an opaque string; all validation is
// client-side here, so a hand-crafted / corrupt payload can never crash the app.

/** The valid intensity ids (mirror of IntensityId) for runtime validation of shared payloads. */
const INTENSITY_IDS = ["deload", "normal", "push"] as const;

/** The load-bearing fields of a routine item that survive a share round-trip. */
export interface SharedRoutineItem {
  exerciseId: string;
  name: string;
  sets: number;
  target?: string;
  variantId?: string;
  priority?: number;
}

/** A day-type as it travels between friends (no local id — the copier assigns one). */
export interface SharedDayType {
  name: string;
  routine: SharedRoutineItem[];
  intensity?: IntensityId;
  window?: { start: number; end: number };
  minRest?: number;
}

/** Serialize a day-type (any shape with these fields) into the shareable payload string. */
export function serializeDayType(dt: {
  name: string;
  routine: SharedRoutineItem[];
  intensity?: IntensityId;
  window?: { start: number; end: number };
  minRest?: number;
}): string {
  const out: SharedDayType = {
    name: dt.name,
    routine: dt.routine.map((r) => ({
      exerciseId: r.exerciseId,
      name: r.name,
      sets: r.sets,
      ...(r.target !== undefined ? { target: r.target } : {}),
      ...(r.variantId !== undefined ? { variantId: r.variantId } : {}),
      ...(r.priority !== undefined ? { priority: r.priority } : {}),
    })),
    ...(dt.intensity !== undefined ? { intensity: dt.intensity } : {}),
    ...(dt.window !== undefined ? { window: dt.window } : {}),
    ...(dt.minRest !== undefined ? { minRest: dt.minRest } : {}),
  };
  return JSON.stringify(out);
}

const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Parse + SANITIZE a shared payload back into a copyable day-type (no id). Returns null if the
 * payload is unusable (bad JSON, no name, or zero valid items). Never throws. Every field is
 * validated and clamped so a malicious/garbage payload from the cloud can't corrupt the store.
 */
export function parseSharedRoutine(payload: string): SharedDayType | null {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isStr(o.name) || !o.name.trim()) return null;
  if (!Array.isArray(o.routine)) return null;

  const routine: SharedRoutineItem[] = [];
  for (const it of o.routine) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    if (!isStr(r.exerciseId) || !isStr(r.name)) continue;
    const sets = isNum(r.sets) ? Math.max(1, Math.min(20, Math.round(r.sets))) : 1;
    routine.push({
      exerciseId: r.exerciseId,
      name: r.name,
      sets,
      ...(isStr(r.target) ? { target: r.target } : {}),
      ...(isStr(r.variantId) ? { variantId: r.variantId } : {}),
      ...(isNum(r.priority) ? { priority: r.priority } : {}),
    });
  }
  if (routine.length === 0) return null;

  const out: SharedDayType = { name: o.name.trim().slice(0, 60), routine };
  if (isStr(o.intensity) && (INTENSITY_IDS as readonly string[]).includes(o.intensity))
    out.intensity = o.intensity as IntensityId;
  const w = o.window as Record<string, unknown> | undefined;
  if (w && isNum(w.start) && isNum(w.end)) out.window = { start: w.start, end: w.end };
  if (isNum(o.minRest)) out.minRest = o.minRest;
  return out;
}

/**
 * ADHERENCIA (0..1) — "¿cumplís la rutina esta semana?" — a robust, day-level signal that
 * survives micro-set noise: how many of the days you were *supposed* to train (Mon→today)
 * you actually trained on.
 *
 *   adherence = díasEntrenados / díasProgramados   (capeado a 0..1)
 *
 * - díasProgramados: días lun→hoy cuyo `slotForDate` NO es REST (los descansos no cuentan).
 * - díasEntrenados:  días distintos lun→hoy con ≥1 log completado ese día.
 * - Si díasProgramados === 0 (semana toda de descanso hasta hoy) → 1 si entrenaste algo, 0 si no.
 *
 * Pure + deterministic: pass in the same `slotForDate`/`rest` a PlanContext uses. `now`
 * defaults to the wall clock; `todayIdx` is Mon=0…Sun=6 so the window is Monday→today inclusive.
 */
export function computeAdherence(
  logs: { at: string }[],
  slotForDate: (dateKey: string) => string,
  rest: string,
  now: Date = new Date(),
): number {
  const todayIdx = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx);

  const trainedDays = new Set<string>();
  for (const l of logs) trainedDays.add(localDayKey(new Date(l.at)));

  let programmed = 0;
  let trained = 0;
  for (let i = 0; i <= todayIdx; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = localDayKey(d);
    if (slotForDate(key) !== rest) programmed++;
    if (trainedDays.has(key)) trained++;
  }

  if (programmed === 0) return trained > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, trained / programmed));
}

// ── FORMA — índice persistente de "estar en forma" ───────────────────────────────
// Ver docs/VISION.md §6. FORMA es un eje ORTOGONAL a weeklyEffort: weeklyEffort es el
// sprint de la semana en curso (se resetea por temporada); FORMA es la identidad de largo
// plazo — una EMA saturada del esfuerzo semanal que se CONSTRUYE con constancia y DECAE
// cuando dejás de entrenar. Como el resto de las capas (adherencia/niveles), no persiste
// estado propio: se RE-COMPUTA desde el stream de logs en cada render, determinista y sin NaN.

/** Una muestra de esfuerzo: el `at` ISO del log + su effortXp intrínseco (intensity=1). */
export interface EffortSample {
  at: string; // ISO timestamp (mismo campo que LogEntry.at)
  effortXp: number; // metrics.effortXp del set (vía activityFromLogs)
}

/**
 * Índice entero monótono de semanas ISO — dos fechas de la misma semana ISO comparten índice y
 * semanas consecutivas dan índices consecutivos (diferencia 1). Reusa el MISMO anclaje que
 * `currentSeasonId` (el jueves ISO, vía `isoThursday`), así FORMA y la liga cuentan "la semana"
 * igual. `Math.round` (no floor) lo hace inmune al ±1h de DST: el jueves de una semana y el de
 * la siguiente están a 7 días exactos, y el offset local nunca cae cerca del borde de redondeo.
 */
function isoWeekIndex(d: Date): number {
  return Math.round(isoThursday(d).getTime() / 604_800_000);
}

// Constantes finales de FORMA (ver SPEC). Anti-gaming y decaimiento salen de acá:
const FORMA_ALPHA = 0.3; // peso EMA de la semana más nueva ⇒ decaimiento 1-α = 0.7/semana
const FORMA_CEIL = 2000; // techo asintótico (una sola semana aporta a lo sumo α·CEIL = 600)
const FORMA_SCALE = 90; // media-saturación del esfuerzo semanal, en unidades effortXp
const FORMA_MAX_WEEKS = 104; // cota de lookback O(1): 0.7^104 ≈ 3e-16 ⇒ igual al historial completo

/** Mapa saturante por semana: esfuerzo semanal `E` → aporte acotado en [0, CEIL). */
function formaWeekMap(E: number): number {
  return FORMA_CEIL * (1 - Math.exp(-Math.max(0, E) / FORMA_SCALE));
}

/**
 * FORMA — índice PERSISTENTE de "estar en forma" (entero 0..2000).
 *
 * EMA (media-vida ≈ 1.94 semanas) del esfuerzo semanal ISO, saturado por semana ANTES de
 * promediar. Sube con constancia/esfuerzo sostenido; BAJA en semanas idle (cada semana sin
 * logs es un paso de decaimiento ×0.7). No se reinicia por temporada — eso es la carrera
 * semanal (weeklyEffort), aparte. Funciona entrenando solo o con amigos (no es ELO pairwise),
 * es comparable en una escala común, y es difícil de gamear: ni una semana enorme aislada lo
 * dispara (tope duro α·CEIL) ni un plan minúsculo lo maximiza (satura en su propio nivel).
 *
 * Puro + determinista: sólo depende de `samples` y `now` (inyectable para tests). Nunca NaN,
 * siempre en rango, sin estado global.
 *
 * @param samples  muestras de esfuerzo (una por set logueado; ver `activityFromLogs`)
 * @param now      reloj inyectable para tests (default: la hora de pared)
 * @returns entero en [0, 2000]
 */
export function computeForma(samples: EffortSample[], now: Date = new Date()): number {
  // PASO 0 — agrupar por índice de semana ISO, descartando basura y semanas futuras.
  const nowIdx = isoWeekIndex(now);
  const effortByIdx = new Map<number, number>();
  let minIdx = Infinity;
  for (const s of samples) {
    const ms = Date.parse(s.at);
    if (!Number.isFinite(ms)) continue; // fecha basura → ignorar
    const wi = isoWeekIndex(new Date(ms));
    if (wi > nowIdx) continue; // semana futura → no infla
    const xp = Number.isFinite(s.effortXp) ? Math.max(0, s.effortXp) : 0;
    effortByIdx.set(wi, (effortByIdx.get(wi) ?? 0) + xp);
    if (wi < minIdx) minIdx = wi;
  }
  if (minIdx === Infinity) return 0; // sin muestras usables

  // PASO 1 — EMA sobre semanas COMPLETAS (viejo → nuevo, EXCLUYE la semana actual). Al iterar
  // el rango entero y contiguo, cada semana vacía intermedia aporta E=0 ⇒ fp(0)=0, que es
  // exactamente el paso de decaimiento ema ← 0.7·ema. No hace falta enumerar fechas.
  const startIdx = Math.max(minIdx, nowIdx - FORMA_MAX_WEEKS);
  let ema = 0;
  for (let wi = startIdx; wi <= nowIdx - 1; wi++) {
    ema = FORMA_ALPHA * formaWeekMap(effortByIdx.get(wi) ?? 0) + (1 - FORMA_ALPHA) * ema;
  }

  // PASO 2 — plegar la semana ACTUAL (parcial) sólo hacia ARRIBA (anti-sawtooth): entrenar hoy
  // puede SUBIR FORMA sobre el cierre de la semana pasada, pero no haber entrenado TODAVÍA esta
  // semana no la baja (evita el bajón de los lunes). La caída por una semana idle se materializa
  // recién cuando esa semana pasa a ser "completa" (PASO 1).
  const candidate =
    FORMA_ALPHA * formaWeekMap(effortByIdx.get(nowIdx) ?? 0) + (1 - FORMA_ALPHA) * ema;
  const result = Math.max(ema, candidate);

  // PASO 3 — mapear a entero acotado.
  return Math.round(Math.min(FORMA_CEIL, Math.max(0, result)));
}
