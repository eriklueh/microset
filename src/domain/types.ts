/** Domain model for microset's Studio (exercises, equipment, variants, logs). */

// Seed ids are suggested, but custom equipment can use any string id.
export type EquipmentId = "pullup-bar" | "dip-bars" | "parallettes" | "bands" | (string & {});

export interface Equipment {
  id: EquipmentId;
  name: string;
}

/** Free-text profile the user fills in for the (future) AI coach to consume. */
export interface UserProfile {
  goals: string;
  diet: string;
  constraints: string;
}

export type MuscleGroup = "pull" | "push" | "core" | "legs";

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  pull: "Tirón",
  push: "Empuje",
  core: "Core",
  legs: "Piernas",
};

/** How a set is measured. */
export type Measure = "reps" | "hold";

/** Where the exercise fits: desk-friendly (silent, no setup, OK in a meeting) vs needs space. */
export type ExerciseContext = "desk" | "space";

export const CONTEXT_LABEL: Record<ExerciseContext, string> = {
  desk: "De escritorio",
  space: "Necesita espacio",
};

/** Where a variant sits on the exercise's intensity axis. */
export type VariantKind = "assist" | "bodyweight" | "load";

/** A rung on the intensity axis (assisted → bodyweight → loaded). */
export interface Variant {
  id: string;
  label: string;
  kind: VariantKind;
}

export interface Exercise {
  id: string;
  name: string;
  /** Equipment required to perform it — the user must own all of these. */
  equipment: EquipmentId[];
  muscle: MuscleGroup;
  measure: Measure;
  /** Where it can be done; defaults to "space" when unset. */
  context?: ExerciseContext;
  /** Default number of sets when added to a routine. */
  defaultSets: number;
  /** Suggested reps or duration per set, e.g. "5" or "10-20s". */
  defaultReps: string;
  /** Intensity axis, ordered easiest → hardest. */
  axis: Variant[];
}

/** A logged set (optional record of what was actually done → progression). */
export interface LogEntry {
  /** ISO timestamp. */
  at: string;
  exerciseId: string;
  variantId?: string;
}
