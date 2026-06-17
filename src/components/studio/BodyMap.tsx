import { useMemo } from "react";
import Model, { type IExerciseData } from "react-body-highlighter";
import { isAvailable } from "@/domain/seed";
import {
  BODY_GROUPS,
  GROUP_MUSCLES,
  NONE_COLOR,
  PRIMARY_COLOR,
  rolesForExercise,
  SECONDARY_COLOR,
  type BodyGroup,
  type Role,
} from "@/domain/bodyGroups";
import type { Exercise, EquipmentId } from "@/domain/types";
import type { RoutineItem } from "@/lib/engine";
import { useT } from "@/lib/i18n";

export type RoleMap = Record<BodyGroup, Role>;
const EMPTY: RoleMap = { chest: "none", back: "none", shoulders: "none", arms: "none", core: "none", legs: "none" };

/** Roles for a single exercise (primary wins over secondary). */
export function rolesState(ex: Exercise): RoleMap {
  const { prim, sec } = rolesForExercise(ex);
  const st: RoleMap = { ...EMPTY };
  sec.forEach((g) => (st[g] = "secondary"));
  prim.forEach((g) => (st[g] = "primary"));
  return st;
}

/** Aggregate roles over a whole (doable) routine. */
export function aggregateRoles(
  routine: RoutineItem[],
  byId: (id: string) => Exercise | undefined,
  owned: EquipmentId[],
): RoleMap {
  const st: RoleMap = { ...EMPTY };
  for (const r of routine) {
    const ex = byId(r.exerciseId);
    if (!ex || !isAvailable(ex, owned)) continue;
    const { prim, sec } = rolesForExercise(ex);
    sec.forEach((g) => {
      if (st[g] !== "primary") st[g] = "secondary";
    });
    prim.forEach((g) => (st[g] = "primary"));
  }
  return st;
}

// react-body-highlighter colors by frequency: index 0 = secondary, 1 = primary.
const HIGHLIGHT = [SECONDARY_COLOR, PRIMARY_COLOR];

function dataFor(state: RoleMap): IExerciseData[] {
  const out: IExerciseData[] = [];
  for (const g of BODY_GROUPS) {
    const role = state[g];
    if (role === "none") continue;
    const freq = role === "primary" ? 2 : 1;
    for (const m of GROUP_MUSCLES[g]) out.push({ name: g, muscles: [m], frequency: freq });
  }
  return out;
}

/** Front + back figures colored by group role (react-body-highlighter, our palette). */
export function BodyFigures({ state, width = 150 }: { state: RoleMap; width?: number }) {
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
              highlightedColors={HIGHLIGHT}
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

/** Primary/secondary muscle-group chips for an exercise row. */
export function GroupChips({ ex }: { ex: Exercise }) {
  const t = useT();
  const { prim, sec } = rolesForExercise(ex);
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
      {prim.map((g) => chip(g, "primary"))}
      {sec.map((g) => chip(g, "secondary"))}
    </div>
  );
}
