/**
 * KERNEL · module registry (plataforma BASE — ver docs/VISION.md §4).
 *
 * A module ships a manifest; boot mounts only the enabled ones. Disabling a module hides
 * its UI and stops its schedulers/signals but NEVER deletes its owned files or events
 * (re-enabling restores everything) — the generalization of the `levelsEnabled` flag.
 *
 * Fase 0: the registry exists and Pausa registers into it on import, but nothing in the
 * running app reads it yet. No behavior change.
 */
import type { Exercise } from "@/domain/types";
import type { ActivityEvent, ActivityMetrics, ModuleId } from "./activity";

/** How much of a module's data may leave the device. Nutrición = 'opt-in' (private by
 *  default, shareable on request, never auto-scored); training modules = 'derived-only'. */
export type SyncPolicy = "never" | "opt-in" | "derived-only" | "full";

/** Read-side context the kernel injects into a module's pure `contribute()`. */
export interface ContributeContext {
  exercise: (id: string) => Exercise | undefined;
}

export interface ModuleManifest {
  id: ModuleId;
  /** Config-dir file group this module owns (wired into files.ts in Fase 0c). */
  fileGroup: string;
  /** Coach action namespace, e.g. "pausa". */
  toolNamespace: string;
  sync: SyncPolicy;
  /** May its data be shared with friends at all (opt-in), independent of league scoring. */
  shareable: boolean;
  /** Does it feed the competitive league score. */
  scoredInLeague: boolean;
  defaultEnabled: boolean;
  /** Pure mapper: an event's payload → its metrics envelope. */
  contribute?: (event: ActivityEvent, ctx: ContributeContext) => ActivityMetrics | undefined;
}

const registry = new Map<ModuleId, ModuleManifest>();

export function registerModule(manifest: ModuleManifest): void {
  registry.set(manifest.id, manifest);
}
export function getModule(id: ModuleId): ModuleManifest | undefined {
  return registry.get(id);
}
export function allModules(): ModuleManifest[] {
  return [...registry.values()];
}
