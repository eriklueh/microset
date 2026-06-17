import { EQUIPMENT, EXERCISES } from "@/domain/seed";
import { EQUIPMENT_EN, EXERCISE_EN, VARIANT_EN } from "@/domain/i18n";
import type { Equipment, Exercise } from "@/domain/types";
import { useStore } from "@/store/useStore";

/**
 * The catalog: the seed library plus the user's custom entries, for both
 * exercises and equipment. The agent (M6) and the UI share this same view.
 *
 * Localized helpers (`name`, `variantLabel`, `eqName`) return English for seed
 * content when the language is English, falling back to the as-entered Spanish /
 * user text otherwise.
 */
export function useCatalog(): {
  all: Exercise[];
  byId: (id: string) => Exercise | undefined;
  allEquipment: Equipment[];
  equipmentById: (id: string) => Equipment | undefined;
  name: (id: string) => string;
  variantLabel: (exerciseId: string, variantId?: string) => string;
  eqName: (id: string) => string;
} {
  const custom = useStore((s) => s.customExercises);
  const customEquipment = useStore((s) => s.customEquipment);
  const lang = useStore((s) => s.lang);
  const all = custom.length ? [...EXERCISES, ...custom] : EXERCISES;
  const allEquipment = customEquipment.length ? [...EQUIPMENT, ...customEquipment] : EQUIPMENT;
  const byId = (id: string) => all.find((e) => e.id === id);
  const equipmentById = (id: string) => allEquipment.find((e) => e.id === id);
  const en = lang === "en";

  return {
    all,
    byId,
    allEquipment,
    equipmentById,
    name: (id) => {
      const e = byId(id);
      if (!e) return id;
      return en ? (EXERCISE_EN[e.id] ?? e.name) : e.name;
    },
    variantLabel: (exerciseId, variantId) => {
      const e = byId(exerciseId);
      if (!e) return "";
      const v =
        e.axis.find((x) => x.id === variantId) ??
        e.axis.find((x) => x.kind === "bodyweight") ??
        e.axis[0];
      if (!v) return "";
      return en ? (VARIANT_EN[v.id] ?? v.label) : v.label;
    },
    eqName: (id) => {
      const eq = equipmentById(id);
      if (!eq) return id;
      return en ? (EQUIPMENT_EN[eq.id] ?? eq.name) : eq.name;
    },
  };
}
