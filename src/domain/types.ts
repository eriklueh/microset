/** Domain model for microset's Studio (exercises, equipment, variants, logs). */

export type EquipmentId = "pullup-bar" | "dip-bars" | "parallettes" | "bands";

export interface Equipment {
  id: EquipmentId;
  name: string;
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
