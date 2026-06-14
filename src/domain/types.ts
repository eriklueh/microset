/** Domain model for microset's Studio (exercises, equipment, routines). */

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

export interface Exercise {
  id: string;
  name: string;
  /** Equipment required to perform it — the user must own all of these. */
  equipment: EquipmentId[];
  muscle: MuscleGroup;
  /** Default number of sets when added to a routine. */
  defaultSets: number;
  /** Suggested reps or duration per set, e.g. "5" or "10–20s". */
  defaultReps: string;
  /** True for isometric holds (L-sit, planche). */
  isHold?: boolean;
}
