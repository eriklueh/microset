import { EXERCISES } from "@/domain/seed";
import { useStore } from "@/store/useStore";
import { toolByName } from "./tools";

/** A change the coach proposes: a tool call (provider-agnostic). */
export interface ProposedChange {
  tool: string;
  args: Record<string, unknown>;
}

const DOW = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const exName = (id: string) => {
  const s = useStore.getState();
  return [...EXERCISES, ...s.customExercises].find((e) => e.id === id)?.name ?? id;
};
const dtName = (id: string) => useStore.getState().dayTypes.find((d) => d.id === id)?.name ?? id;

/** Plain-Spanish description of a proposed change for the review card. */
export function humanizeChange(c: ProposedChange): string {
  const a = c.args as any;
  switch (c.tool) {
    case "add_equipment":
      return `Agregar equipo: ${a.name}`;
    case "set_equipment_owned":
      return `${a.owned ? "Marcar" : "Quitar"} equipo: ${a.id}`;
    case "add_exercise":
      return `Crear ejercicio: ${a.name}${a.context === "desk" ? " (de escritorio)" : ""}`;
    case "add_to_routine":
      return `Agregar ${exName(a.exerciseId)} a ${dtName(a.dayTypeId)}${a.sets ? ` · ${a.sets} series` : ""}`;
    case "remove_from_routine":
      return `Quitar ${exName(a.exerciseId)} de ${dtName(a.dayTypeId)}`;
    case "set_routine_sets":
      return `${exName(a.exerciseId)} → ${a.sets} series · ${dtName(a.dayTypeId)}`;
    case "set_routine_target":
      return `${exName(a.exerciseId)} → ${a.target} · ${dtName(a.dayTypeId)}`;
    case "set_routine_variant":
      return `${exName(a.exerciseId)} → nivel ${a.variantId} · ${dtName(a.dayTypeId)}`;
    case "add_day_type":
      return `Crear tipo de día: ${a.name}`;
    case "rename_day_type":
      return `Renombrar tipo de día → ${a.name}`;
    case "remove_day_type":
      return `Eliminar tipo de día: ${dtName(a.id)}`;
    case "set_week":
      return `${DOW[a.index] ?? `día ${a.index}`} → ${a.slot === "rest" ? "Descanso" : dtName(a.slot)}`;
    case "set_day_kind":
      return `${DOW[a.index] ?? `día ${a.index}`} → ${a.kind === "home" ? "casa" : a.kind === "office" ? "oficina" : "sin lugar"}`;
    case "set_methodology":
      return `Metodología de ${dtName(a.dayTypeId)} → ${a.methodologyId}`;
    case "set_settings":
      return "Ajustar horario / descanso";
    case "set_profile":
      return "Actualizar tu perfil";
    default:
      return describeChange(c);
  }
}

/** Human-readable one-liner for the review card. */
export function describeChange(c: ProposedChange): string {
  const t = toolByName(c.tool);
  const args = Object.entries(c.args)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
  return `${t ? t.name : c.tool}(${args})`;
}

/** Apply approved changes through the shared tool catalog (= the store actions). */
export function applyChanges(changes: ProposedChange[]): string[] {
  return changes.map((c) => {
    const t = toolByName(c.tool);
    if (!t) return `tool desconocida: ${c.tool}`;
    try {
      return t.apply(c.args);
    } catch (e) {
      return `error en ${c.tool}: ${String(e)}`;
    }
  });
}
