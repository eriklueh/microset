import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Masthead } from "./Masthead";
import { EQUIPMENT } from "@/domain/seed";
import { useCatalog } from "@/hooks/useCatalog";
import { useStore } from "@/store/useStore";

const SEED_IDS = new Set(EQUIPMENT.map((e) => e.id));
const input = "border border-[var(--rule2)] bg-transparent text-[var(--fg)] outline-none focus:border-[var(--acc)]";

export function EquipmentView() {
  const owned = useStore((s) => s.ownedEquipment);
  const dayTypes = useStore((s) => s.dayTypes);
  const toggle = useStore((s) => s.toggleEquipment);
  const addCustomEquipment = useStore((s) => s.addCustomEquipment);
  const removeCustomEquipment = useStore((s) => s.removeCustomEquipment);
  const { all, byId, allEquipment } = useCatalog();
  const [name, setName] = useState("");

  const used = new Set(dayTypes.flatMap((d) => d.routine.map((r) => r.exerciseId)));

  const add = () => {
    const n = name.trim();
    if (!n) return;
    addCustomEquipment(n);
    setName("");
  };

  return (
    <div className="flex flex-col px-[34px] py-[30px]">
      <Masthead title="EQUIPO" sub="LO QUE TENÉS EN CASA" />

      <div className="border-b border-[var(--rule)]">
        {allEquipment.map((eq) => {
          const enables = all.filter((e) => e.equipment.includes(eq.id)).length;
          const inRoutines = [...used].filter((id) => byId(id)?.equipment.includes(eq.id)).length;
          const custom = !SEED_IDS.has(eq.id);
          const sub = `${enables} EJERCICIO${enables === 1 ? "" : "S"}${inRoutines > 0 ? ` · ${inRoutines} EN RUTINAS` : ""}`;
          return (
            <div
              key={eq.id}
              className="flex items-center justify-between gap-3 border-t border-[var(--rule)] py-5"
            >
              <div className="min-w-0">
                <div className="truncate text-[17px] font-bold tracking-[-0.01em] text-[var(--fg)] uppercase">
                  {eq.name}
                </div>
                <div className="mt-[5px] font-mono text-[10.5px] tracking-[0.08em] text-[var(--faint)]">
                  {custom ? "PROPIO · " : ""}
                  {sub}
                </div>
              </div>
              <div className="flex flex-none items-center gap-3">
                {custom && (
                  <button
                    onClick={() => removeCustomEquipment(eq.id)}
                    aria-label="Eliminar equipo"
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

      <div className="mt-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="NUEVO EQUIPO (EJ: ANILLAS)"
          className={`${input} h-9 flex-1 px-3 font-mono text-[12px] tracking-[0.04em] placeholder:text-[var(--faint2)]`}
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 border px-3.5 py-2 font-mono text-[11px] font-semibold tracking-[0.06em] disabled:opacity-40"
          style={{ borderColor: "var(--acc)", color: "var(--acc)" }}
        >
          <Plus className="size-3.5" /> AGREGAR
        </button>
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
