import { useMemo } from "react";
import Model, { type IExerciseData } from "react-body-highlighter";
import {
  exerciseGroupRoles,
  freqFor,
  HEAT_RAMP,
  NONE_COLOR,
  SECONDARY_COLOR,
  type BodyGroup,
  type MuscleState,
  type Role,
} from "@/domain/bodyGroups";
import type { Exercise } from "@/domain/types";
import { useT } from "@/lib/i18n";

function dataFor(state: MuscleState): IExerciseData[] {
  return Object.entries(state).map(([m, s]) => ({
    name: m,
    muscles: [m as IExerciseData["muscles"][number]],
    frequency: freqFor(s.role, s.level),
  }));
}

/** Front + back figures painted by role (lime/amber) and volume shade. */
export function BodyFigures({ state, width = 150 }: { state: MuscleState; width?: number }) {
  const t = useT();
  const data = useMemo(() => dataFor(state), [state]);
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
      {(["anterior", "posterior"] as const).map((side) => (
        <div key={side} style={{ textAlign: "center" }}>
          <div style={{ width }}>
            <Model
              data={data}
              type={side}
              bodyColor={NONE_COLOR}
              highlightedColors={HEAT_RAMP}
              svgStyle={{ width: "100%" }}
            />
          </div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-[var(--faint2)]">
            {side === "anterior" ? t.body.front : t.body.back}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Primario / secundario / sin trabajar legend. */
export function BodyLegend() {
  const t = useT();
  const items: [string, string][] = [
    [t.body.primary, "var(--acc)"],
    [t.body.secondary, SECONDARY_COLOR],
    [t.body.untrained.toUpperCase(), "#3a3a32"],
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span style={{ width: 10, height: 10, background: color }} />
          <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--faint2)]">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Primary/secondary muscle-group chips for an exercise row (derived from its muscles). */
export function GroupChips({ ex }: { ex: Exercise }) {
  const t = useT();
  const { primary, secondary } = exerciseGroupRoles(ex);
  const label = (g: BodyGroup) => (t.body.regions as Record<string, string>)[g].toUpperCase();
  const chip = (g: BodyGroup, role: Role) => (
    <span
      key={role + g}
      className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.04em]"
      style={{ color: role === "primary" ? "var(--fg)" : "var(--faint)" }}
    >
      <span style={{ width: 7, height: 7, background: role === "primary" ? "var(--acc)" : SECONDARY_COLOR, flex: "none" }} />
      {label(g)}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {primary.map((g) => chip(g, "primary"))}
      {secondary.map((g) => chip(g, "secondary"))}
    </div>
  );
}
