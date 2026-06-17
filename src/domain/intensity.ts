/**
 * Per-day-type INTENSITY — a non-destructive volume knob. It does NOT rewrite the
 * per-exercise sets you configured; it just scales how many of them get scheduled
 * that day (deload weeks, push days). Lives on the DayType, so the label is always
 * accurate per day, and composes with the monthly calendar. minRest stays in Settings.
 */
export type IntensityId = "deload" | "normal" | "push";

export interface Intensity {
  id: IntensityId;
  name: string;
  tagline: string;
  description: string;
  /** Multiplier applied to each exercise's configured sets at plan time. */
  factor: number;
}

export const DEFAULT_INTENSITY: IntensityId = "normal";

export const INTENSITIES: Intensity[] = [
  {
    id: "deload",
    name: "Descarga",
    tagline: "Menos volumen por unos días",
    description:
      "Reparte ~la mitad de las series ese día. Para semanas de descarga, cansancio o poco tiempo. No toca tu rutina: solo programa menos.",
    factor: 0.5,
  },
  {
    id: "normal",
    name: "Normal",
    tagline: "Tu rutina tal cual",
    description: "Las series que configuraste por ejercicio, sin cambios.",
    factor: 1,
  },
  {
    id: "push",
    name: "Fuerte",
    tagline: "Más volumen ese día",
    description: "Sube el volumen ~1.5×. Para días de carga — fijate que entre en tu horario.",
    factor: 1.5,
  },
];

export function intensityById(id: string | undefined): Intensity | undefined {
  return INTENSITIES.find((m) => m.id === id);
}

/** Non-destructive: scale a configured set count by a day's intensity (min 1 if it was >0). */
export function scaleSets(sets: number, id: IntensityId | undefined): number {
  const f = intensityById(id ?? DEFAULT_INTENSITY)?.factor ?? 1;
  if (sets <= 0) return sets;
  return Math.max(1, Math.round(sets * f));
}
