import { Suspense, lazy, type ReactNode } from "react";
import {
  exerciseGroupRoles,
  NONE_COLOR,
  SECONDARY_COLOR,
  type BodyGroup,
  type MuscleState,
  type Role,
} from "@/domain/bodyGroups";
import type { Exercise } from "@/domain/types";
import { useT } from "@/lib/i18n";
import { Corners, RegMark } from "./hud";
import { RAIL_BODY_W, RAIL_CLASS } from "./shell";

// react-body-highlighter is heavy; load its figure in a lazily-fetched chunk. The fallback is a
// thin Manifiesto skeleton sized to the figure so the rail never jumps while it loads.
const BodyModel = lazy(() => import("./BodyModel"));

/** Front + back figures painted by role (lime/amber) and volume shade. */
export function BodyFigures({
  state,
  width = 150,
  onPick,
}: {
  state: MuscleState;
  width?: number;
  /** When set, muscles are clickable — fires with the react-body-highlighter muscle id. */
  onPick?: (muscle: string) => void;
}) {
  const t = useT();
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
      {(["anterior", "posterior"] as const).map((side) => (
        <div key={side} style={{ textAlign: "center" }}>
          <div style={{ width }}>
            <Suspense
              fallback={
                <div
                  className="ms-blink bg-[var(--bar0)]"
                  style={{ width: "100%", aspectRatio: "1 / 2.4" }}
                />
              }
            >
              <BodyModel state={state} side={side} onPick={onPick} />
            </Suspense>
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
    [t.body.untrained.toUpperCase(), NONE_COLOR],
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

/**
 * The HUD "scanner" box that frames the body figures. Shared by every view's model rail
 * (Hoy / Rutina / Progreso) so the figure sits at the *exact same Y* everywhere — dot-grid
 * telemetry, center glow, tick ruler, divider, sweep line and register chrome included.
 */
export function ModelScanner({
  state,
  onPick,
}: {
  state: MuscleState;
  onPick?: (muscle: string) => void;
}) {
  return (
    <div className="relative overflow-hidden border border-[var(--rule2)]">
      {/* telemetry dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--faint2) 22%, transparent) 1px, transparent 1.5px)",
          backgroundSize: "13px 13px",
        }}
      />
      {/* center glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 34%, color-mix(in oklch, var(--acc) 7%, transparent), transparent 60%)" }}
      />
      {/* top tick ruler */}
      <div className="pointer-events-none absolute inset-x-3 top-1.5 z-[1] flex justify-between">
        {Array.from({ length: 15 }).map((_, i) => (
          <span key={i} className="w-px bg-[var(--rule2)]" style={{ height: i % 3 === 0 ? 6 : 3 }} />
        ))}
      </div>
      {/* center divider (FRENTE | ESPALDA) */}
      <span
        className="pointer-events-none absolute inset-y-6 left-1/2 z-[1] w-px -translate-x-1/2"
        style={{ background: "color-mix(in oklch, var(--rule) 70%, transparent)" }}
      />
      {/* sweeping scan line */}
      <span
        className="ms-scan pointer-events-none absolute inset-x-2 z-[1] h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--acc), transparent)",
          boxShadow: "0 0 6px color-mix(in oklch, var(--acc) 70%, transparent)",
        }}
      />
      <Corners />
      <RegMark className="top-3 left-1/2 -translate-x-1/2" />
      <div className="relative z-[1] flex justify-center px-3 pt-6 pb-3">
        <BodyFigures state={state} width={RAIL_BODY_W} onPick={onPick} />
      </div>
    </div>
  );
}

/**
 * The anchored "model" rail (HUD label row + scanner + per-view footer) shared by Hoy /
 * Rutina / Progreso. Identical structure guarantees the model sits at the same coordinates
 * across views — no shift, no vertical drift. `children` is the per-view footer (legend +
 * counters / hints) rendered below the body.
 */
export function ModelRail({
  label,
  meta,
  state,
  onPick,
  children,
}: {
  label: ReactNode;
  meta: ReactNode;
  state: MuscleState;
  onPick?: (muscle: string) => void;
  children?: ReactNode;
}) {
  return (
    <aside className={RAIL_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-[9.5px] tracking-[0.16em] text-[var(--acc)]">{label}</span>
        <span className="flex flex-none items-center gap-1.5 font-mono text-[9px] tracking-[0.08em] text-[var(--faint2)]">
          {meta}
        </span>
      </div>
      <ModelScanner state={state} onPick={onPick} />
      {children}
    </aside>
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
