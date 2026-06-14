import { EQUIPMENT, EXERCISES } from "@/domain/seed";
import type { Equipment, Exercise } from "@/domain/types";
import { useStore } from "@/store/useStore";

/**
 * The catalog: the seed library plus the user's custom entries, for both
 * exercises and equipment. The agent (M6) and the UI share this same view.
 */
export function useCatalog(): {
  all: Exercise[];
  byId: (id: string) => Exercise | undefined;
  allEquipment: Equipment[];
  equipmentById: (id: string) => Equipment | undefined;
} {
  const custom = useStore((s) => s.customExercises);
  const customEquipment = useStore((s) => s.customEquipment);
  const all = custom.length ? [...EXERCISES, ...custom] : EXERCISES;
  const allEquipment = customEquipment.length ? [...EQUIPMENT, ...customEquipment] : EQUIPMENT;
  return {
    all,
    byId: (id) => all.find((e) => e.id === id),
    allEquipment,
    equipmentById: (id) => allEquipment.find((e) => e.id === id),
  };
}
