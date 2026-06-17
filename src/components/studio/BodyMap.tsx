import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import Model, { type IExerciseData, type IMuscleStats } from "react-body-highlighter";
import type { RoutineItem } from "@/lib/engine";
import type { EquipmentId } from "@/domain/types";
import { isAvailable } from "@/domain/seed";
import {
  HEAT_COLORS,
  loadBucket,
  musclesForExercise,
  REGIONS,
  type BodyMuscle,
} from "@/domain/muscleMap";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";

const BODY_COLOR = "#2a2a27";
const WARN = "#e0a400";

/**
 * Muscle coverage map for a day-type routine, powered by react-body-highlighter
 * (the SVG body only — styled to our palette). Load per muscle = sum of sets of
 * the exercises that work it, bucketed into a lime heatmap. Collapsed it shows a
 * one-line region readout; expanded, front+back figures + a coverage panel, and
 * clicking a muscle lists the exercises that train it (or flags it empty).
 */
export function BodyMap({ routine, owned }: { routine: RoutineItem[]; owned: EquipmentId[] }) {
  const t = useT();
  const { byId, name } = useCatalog();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<BodyMuscle | null>(null);

  const { exForMuscle, modelData, regions, maxRegion, total } = useMemo(() => {
    const load: Partial<Record<BodyMuscle, number>> = {};
    const exForMuscle: Partial<Record<BodyMuscle, string[]>> = {};
    let total = 0;
    for (const r of routine) {
      const ex = byId(r.exerciseId);
      if (!ex || !isAvailable(ex, owned)) continue;
      total += r.sets;
      for (const m of musclesForExercise(ex)) {
        load[m] = (load[m] ?? 0) + r.sets;
        (exForMuscle[m] ??= []).push(name(r.exerciseId));
      }
    }
    const modelData: IExerciseData[] = (Object.entries(load) as [BodyMuscle, number][])
      .filter(([, n]) => n > 0)
      .map(([m, n]) => ({ name: m, muscles: [m], frequency: loadBucket(n) }));
    const regions = REGIONS.map((rg) => {
      const sets = rg.muscles.reduce((s, m) => s + (load[m] ?? 0), 0);
      return { id: rg.id, sets, bucket: loadBucket(sets) };
    });
    const maxRegion = Math.max(1, ...regions.map((r) => r.sets));
    return { exForMuscle, modelData, regions, maxRegion, total };
  }, [routine, owned, byId, name]);

  if (total === 0) return null;

  const heat = (b: number) => (b === 0 ? "var(--faint2)" : HEAT_COLORS[b - 1]);
  const regionLabel = (id: string) => (t.body.regions as Record<string, string>)[id] ?? id;
  const selExercises = sel ? exForMuscle[sel] ?? [] : [];

  return (
    <div className="mt-2 border border-[var(--rule2)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-[var(--bar1)]"
      >
        <span className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--faint)]">{t.body.title}</span>
          <span className="flex items-center gap-1">
            {regions.map((r) => (
              <span key={r.id} title={regionLabel(r.id)} style={{ width: 8, height: 8, background: heat(r.bucket) }} />
            ))}
          </span>
        </span>
        <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-[var(--faint2)]">
          {t.body.open}
          <ChevronDown className="size-4" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>

      {open && (
        <div className="flex flex-wrap gap-6 border-t border-[var(--rule2)] p-4">
          <div className="flex gap-3">
            {(["anterior", "posterior"] as const).map((side) => (
              <div key={side} className="flex flex-col items-center gap-1.5">
                <div style={{ width: 124 }}>
                  <Model
                    data={modelData}
                    type={side}
                    bodyColor={BODY_COLOR}
                    highlightedColors={HEAT_COLORS}
                    onClick={(s: IMuscleStats) => setSel(s.muscle as BodyMuscle)}
                    svgStyle={{ width: "100%" }}
                  />
                </div>
                <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--faint2)]">
                  {side === "anterior" ? t.body.front : t.body.back}
                </span>
              </div>
            ))}
          </div>

          <div className="min-w-[240px] flex-1">
            <div className="mb-2 font-mono text-[10px] tracking-[0.14em] text-[var(--faint)]">{t.body.coverage}</div>
            {regions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-[var(--rule)] py-1.5">
                <span className="w-[84px] text-[13px] text-[var(--fg)]">{regionLabel(r.id)}</span>
                <span className="flex h-[6px] flex-1 bg-[var(--bar0)]">
                  <span style={{ width: `${(r.sets / maxRegion) * 100}%`, background: heat(r.bucket) }} />
                </span>
                <span
                  className="w-[64px] text-right font-mono text-[10px] tracking-[0.06em]"
                  style={{ color: r.bucket === 0 ? WARN : "var(--faint)" }}
                >
                  {r.bucket === 0 ? t.body.levelNone : `${r.sets} ${t.body.sets}`}
                </span>
              </div>
            ))}

            {sel && (
              <div className="mt-3 border border-[var(--rule2)] p-3">
                <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--acc)]">
                  {sel.replace(/-/g, " ").toUpperCase()}
                </div>
                {selExercises.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[...new Set(selExercises)].map((n) => (
                      <span key={n} className="border border-[var(--rule2)] px-2 py-1 font-mono text-[10px] text-[var(--dim)]">
                        {n.toUpperCase()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1.5 text-[12px] text-[var(--faint)]">{t.body.noExercises}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
