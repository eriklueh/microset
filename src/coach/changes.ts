import { toolByName } from "./tools";

/** A change the coach proposes: a tool call (provider-agnostic). */
export interface ProposedChange {
  tool: string;
  args: Record<string, unknown>;
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
