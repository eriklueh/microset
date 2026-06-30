import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ViewHeader, CockpitRail, RailStat } from "./shell";
import { SectionRule } from "./hud";
import { EQUIPMENT } from "@/domain/seed";
import { useCatalog } from "@/hooks/useCatalog";
import { useT } from "@/lib/i18n";
import { useStore } from "@/store/useStore";

const SEED_IDS = new Set(EQUIPMENT.map((e) => e.id));
const input = "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";

export function EquipmentView() {
  const owned = useStore((s) => s.ownedEquipment);
  const dayTypes = useStore((s) => s.dayTypes);
  const toggle = useStore((s) => s.toggleEquipment);
  const addCustomEquipment = useStore((s) => s.addCustomEquipment);
  const removeCustomEquipment = useStore((s) => s.removeCustomEquipment);
  const { all, byId, allEquipment, eqName } = useCatalog();
  const t = useT();
  const [name, setName] = useState("");

  const used = new Set(dayTypes.flatMap((d) => d.routine.map((r) => r.exerciseId)));

  const add = () => {
    const n = name.trim();
    if (!n) return;
    addCustomEquipment(n);
    setName("");
  };

  const ownedCount = owned.length;
  const totalCount = allEquipment.length;

  return (
    <div className="flex h-full flex-col">
      <ViewHeader kicker={t.equipment.sub} title={t.equipment.title} />
      <div className="flex min-h-0 flex-1">
      <CockpitRail label={t.equipment.railLabel}>
        <span className="font-mono text-[9px] tracking-[0.14em] text-[var(--faint)]">
          {t.equipment.owned}
        </span>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-pixel text-[40px] leading-[0.8] tabular-nums text-[var(--fg)]">
            {ownedCount}
          </span>
          <span className="font-pixel text-[18px] tabular-nums text-[var(--faint2)]">/{totalCount}</span>
        </div>
        <div className="mt-4 border-t border-[var(--rule)] pt-3">
          <span className="font-mono text-[9px] tracking-[0.14em] text-[var(--faint)]">
            {t.equipment.total}
          </span>
          <RailStat value={totalCount} unit={t.equipment.exercises} />
        </div>
      </CockpitRail>

      <section className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
      <SectionRule index={1} label={t.equipment.section} right={`${ownedCount}/${totalCount}`} />
      <div className="mt-3 border-b border-[var(--rule)]">
        {allEquipment.map((eq) => {
          const enables = all.filter((e) => e.equipment.includes(eq.id)).length;
          const inRoutines = [...used].filter((id) => byId(id)?.equipment.includes(eq.id)).length;
          const custom = !SEED_IDS.has(eq.id);
          const sub = `${enables} ${enables === 1 ? t.equipment.exercise : t.equipment.exercises}${inRoutines > 0 ? ` · ${inRoutines} ${t.equipment.inRoutines}` : ""}`;
          return (
            <div
              key={eq.id}
              className="flex items-center justify-between gap-3 border-t border-[var(--rule)] py-5"
            >
              <div className="min-w-0">
                <div className="truncate text-[17px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
                  {eqName(eq.id)}
                </div>
                <div className="mt-[5px] font-mono text-[10.5px] tracking-[0.08em] text-[var(--faint)]">
                  {custom ? `${t.equipment.custom} · ` : ""}
                  {sub}
                </div>
              </div>
              <div className="flex flex-none items-center gap-3">
                {custom && (
                  <button
                    onClick={() => removeCustomEquipment(eq.id)}
                    aria-label={t.equipment.removeAria}
                    className="text-[var(--faint2)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                <SquareSwitch on={owned.includes(eq.id)} onClick={() => toggle(eq.id)} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <SectionRule index={2} label={t.equipment.addSection} />
        <div className="mt-3 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder={t.equipment.placeholder}
            className={`${input} h-9 flex-1 px-3 font-mono text-[12px] tracking-[0.04em] placeholder:text-[var(--faint2)]`}
          />
          <button
            onClick={add}
            disabled={!name.trim()}
            className="flex items-center gap-1.5 border px-3.5 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] disabled:opacity-40"
            style={{ borderColor: "var(--acc)", color: "var(--acc)" }}
          >
            <Plus className="size-3.5" /> {t.equipment.add}
          </button>
        </div>
      </div>
      </section>
      </div>
    </div>
  );
}

export function SquareSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="relative h-[26px] w-[48px] flex-none border"
      style={{ borderColor: on ? "var(--acc)" : "var(--rule2)", background: on ? "var(--acc)" : "transparent" }}
    >
      <span
        className="absolute top-[3px] size-[18px]"
        style={{ left: on ? "25px" : "3px", background: on ? "var(--on)" : "var(--faint2)" }}
      />
    </button>
  );
}
