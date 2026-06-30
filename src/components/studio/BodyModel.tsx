import Model, { type IExerciseData } from "react-body-highlighter";
import type { MuscleState } from "@/domain/bodyGroups";
import { freqFor, HEAT_RAMP, NONE_COLOR } from "@/domain/bodyGroups";

/**
 * The actual `react-body-highlighter` figure. Split into its own module so that heavy dep lands
 * in a lazily-loaded chunk — fetched only when a body figure first renders (see BodyMap's lazy
 * import + Suspense skeleton). Renders one side (anterior/posterior) from the muscle state.
 */
function dataFor(state: MuscleState): IExerciseData[] {
  return Object.entries(state).map(([m, s]) => ({
    name: m,
    muscles: [m as IExerciseData["muscles"][number]],
    frequency: freqFor(s.role, s.level),
  }));
}

export default function BodyModel({
  state,
  side,
  onPick,
}: {
  state: MuscleState;
  side: "anterior" | "posterior";
  onPick?: (muscle: string) => void;
}) {
  return (
    <Model
      data={dataFor(state)}
      type={side}
      bodyColor={NONE_COLOR}
      highlightedColors={HEAT_RAMP}
      svgStyle={{ width: "100%" }}
      onClick={onPick ? (s) => onPick((s as { muscle: string }).muscle) : undefined}
    />
  );
}
