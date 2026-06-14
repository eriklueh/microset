import { EXERCISES } from "@/domain/seed";
import type { Exercise } from "@/domain/types";
import { useStore } from "@/store/useStore";

/** The exercise catalog: the seed library plus the user's custom exercises. */
export function useCatalog(): {
  all: Exercise[];
  byId: (id: string) => Exercise | undefined;
} {
  const custom = useStore((s) => s.customExercises);
  const all = custom.length ? [...EXERCISES, ...custom] : EXERCISES;
  return { all, byId: (id) => all.find((e) => e.id === id) };
}
