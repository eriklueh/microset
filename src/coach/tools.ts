import { EXERCISES } from "@/domain/seed";
import { REST, useStore } from "@/store/useStore";

/**
 * Provider-agnostic tool catalog. ONE source of truth: API/local adapters turn
 * `params` into the provider's tool schema, and `apply` runs the change through
 * the SAME store actions the UI uses (which then persist to the config files).
 * Destructive/cosmetic actions (resetAll, theme) are deliberately excluded.
 */
export interface CoachTool {
  name: string;
  description: string;
  params: Record<string, unknown>; // JSON Schema (object)
  apply: (args: any) => string; // returns a short human-readable result
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const enm = (values: string[], description: string) => ({ type: "string", enum: values, description });

function exName(id: string): string {
  const s = useStore.getState();
  return [...EXERCISES, ...s.customExercises].find((e) => e.id === id)?.name ?? id;
}

export const COACH_TOOLS: CoachTool[] = [
  {
    name: "add_equipment",
    description: "Create a new custom equipment item the user owns (e.g. rings, kettlebell, hand grip).",
    params: obj({ name: str("Display name, e.g. 'Anillas'") }, ["name"]),
    apply: ({ name }) => {
      const eq = useStore.getState().addCustomEquipment(name);
      return `Equipo creado: ${eq.name} (${eq.id})`;
    },
  },
  {
    name: "set_equipment_owned",
    description: "Mark an equipment id as owned or not owned.",
    params: obj({ id: str("Equipment id"), owned: { type: "boolean", description: "Owned?" } }, ["id", "owned"]),
    apply: ({ id, owned }) => {
      const st = useStore.getState();
      if (st.ownedEquipment.includes(id) !== owned) st.toggleEquipment(id);
      return `Equipo ${id}: ${owned ? "tenés" : "no tenés"}`;
    },
  },
  {
    name: "add_exercise",
    description: "Create a custom exercise. context 'desk' = silent/no-setup (OK during meetings); 'space' = needs room.",
    params: obj(
      {
        name: str("Exercise name"),
        muscle: enm(["pull", "push", "core", "legs"], "Muscle group"),
        equipment: { type: "array", items: { type: "string" }, description: "Required equipment ids (user must own all)" },
        measure: enm(["reps", "hold"], "Reps or timed hold"),
        context: enm(["desk", "space"], "Where it can be done"),
        defaultReps: str("Default reps/duration, e.g. '8' or '20s'"),
      },
      ["name", "muscle", "measure", "context"],
    ),
    apply: ({ name, muscle, equipment, measure, context, defaultReps }) => {
      const ex = useStore.getState().addCustomExercise({
        name,
        muscle,
        equipment: equipment ?? [],
        measure: measure ?? "reps",
        context: context ?? "space",
        defaultReps: defaultReps ?? (measure === "hold" ? "20s" : "8"),
      });
      return `Ejercicio creado: ${ex.name} (${ex.id})`;
    },
  },
  {
    name: "add_to_routine",
    description: "Add an exercise to a day-type's routine.",
    params: obj(
      {
        dayTypeId: str("Day-type id"),
        exerciseId: str("Exercise id (from catalog)"),
        sets: int("Sets per day"),
        target: str("Reps/duration override"),
        variantId: str("Intensity variant id"),
      },
      ["dayTypeId", "exerciseId"],
    ),
    apply: ({ dayTypeId, exerciseId, sets, target, variantId }) => {
      useStore.getState().addToRoutine(dayTypeId, {
        exerciseId,
        name: exName(exerciseId),
        sets: sets ?? 3,
        target,
        variantId,
      });
      return `Agregado ${exName(exerciseId)} a ${dayTypeId}`;
    },
  },
  {
    name: "remove_from_routine",
    description: "Remove an exercise from a day-type's routine.",
    params: obj({ dayTypeId: str("Day-type id"), exerciseId: str("Exercise id") }, ["dayTypeId", "exerciseId"]),
    apply: ({ dayTypeId, exerciseId }) => {
      useStore.getState().removeFromRoutine(dayTypeId, exerciseId);
      return `Quitado ${exName(exerciseId)} de ${dayTypeId}`;
    },
  },
  {
    name: "set_routine_sets",
    description: "Set the daily set count for an exercise in a day-type.",
    params: obj({ dayTypeId: str("Day-type id"), exerciseId: str("Exercise id"), sets: int("Sets") }, ["dayTypeId", "exerciseId", "sets"]),
    apply: ({ dayTypeId, exerciseId, sets }) => {
      useStore.getState().setRoutineSets(dayTypeId, exerciseId, sets);
      return `${exName(exerciseId)}: ${sets} series`;
    },
  },
  {
    name: "set_routine_target",
    description: "Set reps/duration for an exercise in a day-type.",
    params: obj({ dayTypeId: str("Day-type id"), exerciseId: str("Exercise id"), target: str("e.g. '5' or '20s'") }, ["dayTypeId", "exerciseId", "target"]),
    apply: ({ dayTypeId, exerciseId, target }) => {
      useStore.getState().setRoutineTarget(dayTypeId, exerciseId, target);
      return `${exName(exerciseId)}: ${target}`;
    },
  },
  {
    name: "set_routine_variant",
    description: "Set the intensity variant for an exercise in a day-type.",
    params: obj({ dayTypeId: str("Day-type id"), exerciseId: str("Exercise id"), variantId: str("Variant id from the exercise axis") }, ["dayTypeId", "exerciseId", "variantId"]),
    apply: ({ dayTypeId, exerciseId, variantId }) => {
      useStore.getState().setRoutineVariant(dayTypeId, exerciseId, variantId);
      return `${exName(exerciseId)}: variante ${variantId}`;
    },
  },
  {
    name: "add_day_type",
    description: "Create a new day-type (routine template). Returns its id.",
    params: obj({ name: str("Day-type name, e.g. 'Oficina'") }, ["name"]),
    apply: ({ name }) => {
      const id = useStore.getState().addDayType(name);
      return `Tipo de día creado: ${name} (${id})`;
    },
  },
  {
    name: "rename_day_type",
    description: "Rename a day-type.",
    params: obj({ id: str("Day-type id"), name: str("New name") }, ["id", "name"]),
    apply: ({ id, name }) => {
      useStore.getState().renameDayType(id, name);
      return `Tipo de día ${id} → ${name}`;
    },
  },
  {
    name: "remove_day_type",
    description: "Delete a day-type (at least one must remain).",
    params: obj({ id: str("Day-type id") }, ["id"]),
    apply: ({ id }) => {
      useStore.getState().removeDayType(id);
      return `Tipo de día eliminado: ${id}`;
    },
  },
  {
    name: "set_week",
    description: "Assign a day-type id (or 'rest') to a weekday. index 0=Mon … 6=Sun.",
    params: obj({ index: int("0=Mon … 6=Sun"), slot: str("Day-type id or 'rest'") }, ["index", "slot"]),
    apply: ({ index, slot }) => {
      useStore.getState().setWeekDay(index, slot === "rest" ? REST : slot);
      return `Día ${index} → ${slot}`;
    },
  },
  {
    name: "set_day_kind",
    description: "Tag a weekday as home/office (or clear it). index 0=Mon … 6=Sun.",
    params: obj({ index: int("0=Mon … 6=Sun"), kind: enm(["home", "office", "none"], "home, office, or none to clear") }, ["index", "kind"]),
    apply: ({ index, kind }) => {
      useStore.getState().setDayKind(index, kind === "none" ? null : kind);
      return `Día ${index} lugar → ${kind}`;
    },
  },
  {
    name: "set_methodology",
    description: "Apply a methodology preset to a day-type (adjusts sets + min rest).",
    params: obj({ dayTypeId: str("Day-type id"), methodologyId: enm(["gtg", "volume", "strength", "maintenance", "free"], "Methodology id") }, ["dayTypeId", "methodologyId"]),
    apply: ({ dayTypeId, methodologyId }) => {
      useStore.getState().applyMethodology(dayTypeId, methodologyId);
      return `Metodología ${methodologyId} en ${dayTypeId}`;
    },
  },
  {
    name: "set_settings",
    description: "Update work window / min rest / avoid windows (times are minutes since midnight).",
    params: obj({
      workWindowStart: int("Work start (min since midnight)"),
      workWindowEnd: int("Work end (min since midnight)"),
      minRest: int("Min minutes between sets"),
    }),
    apply: ({ workWindowStart, workWindowEnd, minRest }) => {
      const st = useStore.getState();
      const patch: { workWindow?: { start: number; end: number }; minRest?: number } = {};
      if (workWindowStart != null || workWindowEnd != null) {
        patch.workWindow = {
          start: workWindowStart ?? st.settings.workWindow.start,
          end: workWindowEnd ?? st.settings.workWindow.end,
        };
      }
      if (minRest != null) patch.minRest = minRest;
      st.setSettings(patch);
      return `Ajustes actualizados`;
    },
  },
  {
    name: "set_profile",
    description: "Update the coach profile (goals / diet / constraints).",
    params: obj({ goals: str("Goals"), diet: str("Diet"), constraints: str("Constraints/notes") }),
    apply: ({ goals, diet, constraints }) => {
      const patch: { goals?: string; diet?: string; constraints?: string } = {};
      if (goals != null) patch.goals = goals;
      if (diet != null) patch.diet = diet;
      if (constraints != null) patch.constraints = constraints;
      useStore.getState().setProfile(patch);
      return `Perfil actualizado`;
    },
  },
];

export function toolByName(name: string): CoachTool | undefined {
  return COACH_TOOLS.find((t) => t.name === name);
}
