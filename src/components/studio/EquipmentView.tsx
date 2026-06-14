import { Masthead } from "./Masthead";
import { EQUIPMENT } from "@/domain/seed";
import { useCatalog } from "@/hooks/useCatalog";
import { useStore } from "@/store/useStore";

export function EquipmentView() {
  const owned = useStore((s) => s.ownedEquipment);
  const dayTypes = useStore((s) => s.dayTypes);
  const toggle = useStore((s) => s.toggleEquipment);
  const { all, byId } = useCatalog();

  const used = new Set(dayTypes.flatMap((d) => d.routine.map((r) => r.exerciseId)));

  return (
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="EQUIPO" sub="LO QUE TENÉS EN CASA" />
      <div className="border-b border-[var(--rule)]">
        {EQUIPMENT.map((eq) => {
          const enables = all.filter((e) => e.equipment.includes(eq.id)).length;
          const inRoutines = [...used].filter((id) => byId(id)?.equipment.includes(eq.id)).length;
          const on = owned.includes(eq.id);
          const sub = `${enables} EJERCICIO${enables === 1 ? "" : "S"}${inRoutines > 0 ? ` · ${inRoutines} EN RUTINAS` : ""}`;
          return (
            <div
              key={eq.id}
              className="flex items-center justify-between border-t border-[var(--rule)] py-5"
            >
              <div>
                <div className="text-[17px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
                  {eq.name}
                </div>
                <div className="mt-[5px] font-mono text-[10.5px] tracking-[0.08em] text-[var(--faint)]">
                  {sub}
                </div>
              </div>
              <SquareSwitch on={on} onClick={() => toggle(eq.id)} />
            </div>
          );
        })}
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
