import { describe, it, expect } from "vitest";
import { allModules } from "@/kernel";
import "@/modules/pausa/pausa"; // ensure Pausa is registered
import { COACH_TOOLS, buildCoachTools, enabledToolNamespaces } from "./tools";

/**
 * Guards the Fase 1 registry-aware catalog: `buildCoachTools()` assembles from the UNION of the
 * enabled modules' tool namespaces. With only Pausa enabled today, it must be byte-for-byte the
 * current `COACH_TOOLS` — no behavior change for the coach.
 */
describe("coach tools — registry-aware catalog", () => {
  it("enabledToolNamespaces includes pausa (default-enabled)", () => {
    expect(enabledToolNamespaces().has("pausa")).toBe(true);
    // every enabled namespace must correspond to a registered, default-enabled module
    const enabled = new Set(allModules().filter((m) => m.defaultEnabled).map((m) => m.toolNamespace));
    expect(enabledToolNamespaces()).toEqual(enabled);
  });

  it("buildCoachTools equals COACH_TOOLS today (same objects, same order)", () => {
    const built = buildCoachTools();
    expect(built).toHaveLength(COACH_TOOLS.length);
    expect(built).toEqual(COACH_TOOLS);
    built.forEach((t, i) => expect(t).toBe(COACH_TOOLS[i])); // referential identity, no copies
  });

  it("tool names are unique in the assembled catalog", () => {
    const names = buildCoachTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
