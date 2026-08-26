import { mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";
import * as reducers from "../src/store/reducers";
import { sanitizeEquipment, sanitizeExercises, sanitizeRoutine } from "../src/store/sanitize";

/**
 * MCP · Fase C — mutations de ESCRITURA del coach remoto. Cada tool hace read-modify-write
 * de UN userDoc (por file-group), reusando los REDUCERS puros del store (../src/store/reducers)
 * y el SANITIZER puro del file-group (../src/store/sanitize). Así un cambio de config aterriza
 * IDÉNTICO venga del desktop o de un coach remoto — misma lógica, mismo hash.
 *
 * IDENTIDAD (regla de oro): el `userId` sale SIEMPRE de `caller.subject` (el Clerk `sub` del
 * token verificado, inyectado por el Gateway con `mcpCallerValidator` + `identityArg:"caller"`),
 * NUNCA de un arg de datos. A través del Gateway, Convex descarta `ctx.auth` en el borde del
 * componente, así que NO se usa `ctx.auth.getUserIdentity()` acá (igual que coach.ts).
 *
 * FORMA (importante): el `data` del userDoc es la forma de ARCHIVO (el `select` de files.ts —
 * p.ej. equipment = {owned, custom}), mientras que los reducers/sanitizers operan sobre la forma
 * de STORE (p.ej. {ownedEquipment, customEquipment}). El adapter por-group hace el puente en ambos
 * sentidos, preservando las keys de archivo que el tool no toca (p.ej. settings.theme/modules).
 *
 * NUNCA se expone un tool que escriba `logs` (append-only, propiedad del motor) ni el plan del día.
 */

/** Sentinel de día de descanso — coincide con REST de src/store/useStore.ts (no importable acá). */
const REST = "rest";

// ── adapters de forma por file-group (archivo ⇄ store) ───────────────────────
type Adapter = {
  /** doc en forma de ARCHIVO → slice en forma de STORE que consumen reducer + sanitizer */
  toSlice: (data: any) => any;
  /** slice de STORE ya transformado → doc en forma de ARCHIVO (preserva keys intactas) */
  merge: (data: any, next: any) => any;
  /** sanitizer del group, in place sobre el `next` en forma de STORE (cur = slice previo) */
  sanitize?: (next: Record<string, unknown>, cur: any) => void;
};

const ADAPTERS: Record<string, Adapter> = {
  // routine: archivo y store comparten forma {dayTypes, week, dayKind, dayOverrides}.
  "routine.json": {
    toSlice: (d) => ({
      dayTypes: d?.dayTypes ?? [],
      week: d?.week ?? [],
      dayKind: d?.dayKind ?? [],
      dayOverrides: d?.dayOverrides ?? {},
    }),
    merge: (_d, n) => ({
      dayTypes: n.dayTypes,
      week: n.week,
      dayKind: n.dayKind,
      dayOverrides: n.dayOverrides,
    }),
    sanitize: (next, cur) => sanitizeRoutine(next, cur, REST),
  },
  // equipment: archivo {owned, custom} ⇄ store {ownedEquipment, customEquipment}.
  "equipment.json": {
    toSlice: (d) => ({ ownedEquipment: d?.owned ?? [], customEquipment: d?.custom ?? [] }),
    merge: (_d, n) => ({ owned: n.ownedEquipment, custom: n.customEquipment }),
    sanitize: (next) => sanitizeEquipment(next),
  },
  // exercises: archivo {custom} ⇄ store {customExercises}.
  "exercises.json": {
    toSlice: (d) => ({ customExercises: d?.custom ?? [] }),
    merge: (_d, n) => ({ custom: n.customExercises }),
    sanitize: (next, cur) => sanitizeExercises(next, cur),
  },
  // settings: el doc tiene {settings, theme, panelEnabled, modules, …}; solo tocamos `settings`
  // y preservamos el resto (set_settings jamás toca theme/modules/etc.). Sin sanitizer dedicado.
  "settings.json": {
    toSlice: (d) => ({ settings: d?.settings ?? {} }),
    merge: (d, n) => ({ ...d, settings: n.settings }),
  },
  // profile: el doc ES el objeto profile ({goals, diet, constraints}). Store lo envuelve en {profile}.
  "profile.json": {
    toSlice: (d) => ({ profile: d ?? {} }),
    merge: (_d, n) => n.profile,
  },
};

/**
 * Read-modify-write de UN userDoc del PROPIO usuario, con reducer puro + sanitizer.
 *  1. lee el doc (índice by_user_group); si NO existe → throw con mensaje claro.
 *  2. parsea el JSON (forma de archivo) → slice (forma de store, vía adapter).
 *  3. `transform(slice)` = el reducer → patch; next = {...slice, ...patch}.
 *  4. corre el sanitizer del group sobre next (defensa server-side antes de commitear).
 *  5. mergea de vuelta a forma de archivo y guarda (rev+1, updatedAt server) — LWW por doc.
 */
export async function applyToUserDoc(
  ctx: MutationCtx,
  userId: string,
  group: string,
  transform: (slice: any) => any,
): Promise<{ rev: number }> {
  const adapter = ADAPTERS[group];
  if (!adapter) throw new Error(`file-group no editable por el coach: ${group}`);
  const row = await ctx.db
    .query("userDocs")
    .withIndex("by_user_group", (q) => q.eq("userId", userId).eq("group", group))
    .first();
  if (!row) {
    throw new Error(
      `No hay ${group} sincronizado. Activá "Sincronizar entre dispositivos" en Ajustes del desktop primero.`,
    );
  }
  let data: any;
  try {
    data = JSON.parse(row.data);
  } catch {
    throw new Error(`El doc ${group} tiene JSON inválido en la nube; no se puede editar.`);
  }
  const slice = adapter.toSlice(data);
  const patch = transform(slice);
  const next = { ...slice, ...patch } as Record<string, unknown>;
  adapter.sanitize?.(next, slice as never);
  const fileNext = adapter.merge(data, next);
  const rev = row.rev + 1;
  await ctx.db.patch(row._id, { data: JSON.stringify(fileNext), rev, updatedAt: Date.now() });
  return { rev };
}

/**
 * Resuelve el nombre visible de un ejercicio para el `RoutineItem` (el motor lo usa en el toast).
 * El catálogo seed NO está disponible server-side (arrastraría el alias `@/` + el engine al bundle
 * de Convex), así que resolvemos los CUSTOM leyendo el doc `exercises` y, para los seed, dejamos el
 * id: el RoutineView del desktop re-resuelve el nombre por id (byId) al renderizar la rutina.
 */
async function resolveExerciseName(
  ctx: MutationCtx,
  userId: string,
  exerciseId: string,
): Promise<string> {
  const row = await ctx.db
    .query("userDocs")
    .withIndex("by_user_group", (q) => q.eq("userId", userId).eq("group", "exercises.json"))
    .first();
  if (row) {
    try {
      const d = JSON.parse(row.data);
      const found = Array.isArray(d?.custom)
        ? d.custom.find((e: any) => e?.id === exerciseId)
        : undefined;
      if (found?.name) return found.name;
    } catch {
      // doc ilegible → cae al fallback por id
    }
  }
  return exerciseId;
}

// ── args validators (exportados para reusarlos EXACTO en el registro MCP de mcp.ts) ──
// Cada tool declara `caller` (mcpCallerValidator, inyectado — excluido del inputSchema público)
// + sus toolArgs, réplica de los JSON Schema de src/coach/tools.ts (mismos required/enums).
const caller = mcpCallerValidator;

// → doc equipment
export const addEquipmentArgs = { caller, name: v.string() };
export const setEquipmentOwnedArgs = { caller, id: v.string(), owned: v.boolean() };

// → doc exercises
export const addExerciseArgs = {
  caller,
  name: v.string(),
  muscle: v.union(v.literal("pull"), v.literal("push"), v.literal("core"), v.literal("legs")),
  primary: v.array(v.string()),
  secondary: v.optional(v.array(v.string())),
  equipment: v.optional(v.array(v.string())),
  measure: v.union(v.literal("reps"), v.literal("hold")),
  context: v.union(v.literal("desk"), v.literal("space")),
  defaultReps: v.optional(v.string()),
};

// → doc routine
export const addToRoutineArgs = {
  caller,
  dayTypeId: v.string(),
  exerciseId: v.string(),
  sets: v.optional(v.number()),
  target: v.optional(v.string()),
  variantId: v.optional(v.string()),
};
export const removeFromRoutineArgs = { caller, dayTypeId: v.string(), exerciseId: v.string() };
export const setRoutineSetsArgs = {
  caller,
  dayTypeId: v.string(),
  exerciseId: v.string(),
  sets: v.number(),
};
export const setRoutineTargetArgs = {
  caller,
  dayTypeId: v.string(),
  exerciseId: v.string(),
  target: v.string(),
};
export const setRoutineVariantArgs = {
  caller,
  dayTypeId: v.string(),
  exerciseId: v.string(),
  variantId: v.string(),
};
export const setRoutineOrderArgs = {
  caller,
  dayTypeId: v.string(),
  exerciseIds: v.array(v.string()),
};
export const addDayTypeArgs = { caller, name: v.string() };
export const renameDayTypeArgs = { caller, id: v.string(), name: v.string() };
export const removeDayTypeArgs = { caller, id: v.string() };
export const setWeekArgs = { caller, index: v.number(), slot: v.string() };
export const setDayKindArgs = {
  caller,
  index: v.number(),
  kind: v.union(v.literal("home"), v.literal("office"), v.literal("none")),
};
export const setDayOverrideArgs = {
  caller,
  date: v.string(),
  slot: v.optional(v.string()),
  kind: v.optional(v.union(v.literal("home"), v.literal("office"), v.literal("none"))),
};
export const clearDayOverrideArgs = { caller, date: v.string() };
export const setIntensityArgs = {
  caller,
  dayTypeId: v.string(),
  intensity: v.union(v.literal("deload"), v.literal("normal"), v.literal("push")),
};
export const setDayScheduleArgs = {
  caller,
  dayTypeId: v.string(),
  windowStart: v.optional(v.number()),
  windowEnd: v.optional(v.number()),
  minRest: v.optional(v.number()),
  useGlobal: v.optional(v.boolean()),
};

// → doc settings (solo subcampos workWindow/minRest)
export const setSettingsArgs = {
  caller,
  workWindowStart: v.optional(v.number()),
  workWindowEnd: v.optional(v.number()),
  minRest: v.optional(v.number()),
};

// → doc profile
export const setProfileArgs = {
  caller,
  goals: v.optional(v.string()),
  diet: v.optional(v.string()),
  constraints: v.optional(v.string()),
};

// ── mutations (una por tool) ─────────────────────────────────────────────────

// → doc equipment
export const addEquipment = mutation({
  args: addEquipmentArgs,
  handler: async (ctx, { caller, name }) => {
    let created = "";
    await applyToUserDoc(ctx, caller.subject, "equipment.json", (s) => {
      const eq = reducers.buildEquipment(reducers.newId(), name);
      created = `${eq.name} (${eq.id})`;
      return reducers.addEquipment(s, eq);
    });
    return `Equipo creado: ${created}`;
  },
});

export const setEquipmentOwned = mutation({
  args: setEquipmentOwnedArgs,
  handler: async (ctx, { caller, id, owned }) => {
    await applyToUserDoc(ctx, caller.subject, "equipment.json", (s) =>
      s.ownedEquipment.includes(id) !== owned ? reducers.toggleEquipment(s, id) : {},
    );
    return `Equipo ${id}: ${owned ? "tenés" : "no tenés"}`;
  },
});

// → doc exercises
export const addExercise = mutation({
  args: addExerciseArgs,
  handler: async (
    ctx,
    { caller, name, muscle, primary, secondary, equipment, measure, context, defaultReps },
  ) => {
    let created = "";
    await applyToUserDoc(ctx, caller.subject, "exercises.json", (s) => {
      const ex = reducers.buildExercise(reducers.newId(), {
        name,
        muscle,
        primary: primary ?? undefined,
        secondary: secondary ?? undefined,
        equipment: equipment ?? [],
        measure: measure ?? "reps",
        context: context ?? "space",
        defaultReps: defaultReps ?? (measure === "hold" ? "20s" : "8"),
      });
      created = `${ex.name} (${ex.id})`;
      return reducers.addExercise(s, ex);
    });
    return `Ejercicio creado: ${created}`;
  },
});

// → doc routine
export const addToRoutine = mutation({
  args: addToRoutineArgs,
  handler: async (ctx, { caller, dayTypeId, exerciseId, sets, target, variantId }) => {
    const name = await resolveExerciseName(ctx, caller.subject, exerciseId);
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.addToRoutine(s, dayTypeId, {
        exerciseId,
        name,
        sets: sets ?? 3,
        target,
        variantId,
      }),
    );
    return `Agregado ${name} a ${dayTypeId}`;
  },
});

export const removeFromRoutine = mutation({
  args: removeFromRoutineArgs,
  handler: async (ctx, { caller, dayTypeId, exerciseId }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.removeFromRoutine(s, dayTypeId, exerciseId),
    );
    return `Quitado ${exerciseId} de ${dayTypeId}`;
  },
});

export const setRoutineSets = mutation({
  args: setRoutineSetsArgs,
  handler: async (ctx, { caller, dayTypeId, exerciseId, sets }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setRoutineSets(s, dayTypeId, exerciseId, sets),
    );
    return `${exerciseId}: ${Math.max(1, sets)} series`;
  },
});

export const setRoutineTarget = mutation({
  args: setRoutineTargetArgs,
  handler: async (ctx, { caller, dayTypeId, exerciseId, target }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setRoutineTarget(s, dayTypeId, exerciseId, target),
    );
    return `${exerciseId}: ${target}`;
  },
});

export const setRoutineVariant = mutation({
  args: setRoutineVariantArgs,
  handler: async (ctx, { caller, dayTypeId, exerciseId, variantId }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setRoutineVariant(s, dayTypeId, exerciseId, variantId),
    );
    return `${exerciseId}: variante ${variantId}`;
  },
});

export const setRoutineOrder = mutation({
  args: setRoutineOrderArgs,
  handler: async (ctx, { caller, dayTypeId, exerciseIds }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setRoutineOrder(s, dayTypeId, exerciseIds ?? []),
    );
    return `Orden de ${dayTypeId} actualizado (${(exerciseIds ?? []).length} ejercicios)`;
  },
});

export const addDayType = mutation({
  args: addDayTypeArgs,
  handler: async (ctx, { caller, name }) => {
    const id = reducers.newId();
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.addDayType(s, id, name),
    );
    return `Tipo de día creado: ${name} (${id})`;
  },
});

export const renameDayType = mutation({
  args: renameDayTypeArgs,
  handler: async (ctx, { caller, id, name }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.renameDayType(s, id, name),
    );
    return `Tipo de día ${id} → ${name}`;
  },
});

export const removeDayType = mutation({
  args: removeDayTypeArgs,
  handler: async (ctx, { caller, id }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.removeDayType(s, id),
    );
    return `Tipo de día eliminado: ${id}`;
  },
});

export const setWeek = mutation({
  args: setWeekArgs,
  handler: async (ctx, { caller, index, slot }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setWeekDay(s, index, slot === "rest" ? REST : slot),
    );
    return `Día ${index} → ${slot}`;
  },
});

export const setDayKind = mutation({
  args: setDayKindArgs,
  handler: async (ctx, { caller, index, kind }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setDayKind(s, index, kind === "none" ? null : kind),
    );
    return `Día ${index} lugar → ${kind}`;
  },
});

export const setDayOverride = mutation({
  args: setDayOverrideArgs,
  handler: async (ctx, { caller, date, slot, kind }) => {
    const patch: { slot?: string; kind?: "home" | "office" | null } = {};
    if (slot != null) patch.slot = slot === "rest" ? REST : slot;
    if (kind != null) patch.kind = kind === "none" ? null : kind;
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setDayOverride(s, date, patch),
    );
    return `Override ${date} actualizado`;
  },
});

export const clearDayOverride = mutation({
  args: clearDayOverrideArgs,
  handler: async (ctx, { caller, date }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.clearDayOverride(s, date),
    );
    return `Override quitado: ${date} (vuelve al patrón semanal)`;
  },
});

export const setIntensity = mutation({
  args: setIntensityArgs,
  handler: async (ctx, { caller, dayTypeId, intensity }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) =>
      reducers.setIntensity(s, dayTypeId, intensity),
    );
    return `Intensidad ${intensity} en ${dayTypeId}`;
  },
});

export const setDaySchedule = mutation({
  args: setDayScheduleArgs,
  handler: async (ctx, { caller, dayTypeId, windowStart, windowEnd, minRest, useGlobal }) => {
    await applyToUserDoc(ctx, caller.subject, "routine.json", (s) => {
      if (useGlobal) return reducers.setDaySchedule(s, dayTypeId, { window: null, minRest: null });
      const patch: { window?: { start: number; end: number }; minRest?: number } = {};
      if (typeof windowStart === "number" && typeof windowEnd === "number")
        patch.window = { start: windowStart, end: windowEnd };
      if (typeof minRest === "number") patch.minRest = minRest;
      return reducers.setDaySchedule(s, dayTypeId, patch);
    });
    return useGlobal ? `Horario global en ${dayTypeId}` : `Horario propio en ${dayTypeId}`;
  },
});

// → doc settings (solo workWindow/minRest; jamás theme/modules/notifications/etc.)
export const setSettings = mutation({
  args: setSettingsArgs,
  handler: async (ctx, { caller, workWindowStart, workWindowEnd, minRest }) => {
    await applyToUserDoc(ctx, caller.subject, "settings.json", (s) => {
      const cur = s.settings ?? {};
      const patch: { workWindow?: { start: number; end: number }; minRest?: number } = {};
      if (workWindowStart != null || workWindowEnd != null) {
        patch.workWindow = {
          start: workWindowStart ?? cur.workWindow?.start ?? 0,
          end: workWindowEnd ?? cur.workWindow?.end ?? 0,
        };
      }
      if (minRest != null) patch.minRest = minRest;
      return reducers.setSettings(s, patch);
    });
    return `Ajustes actualizados`;
  },
});

// → doc profile
export const setProfile = mutation({
  args: setProfileArgs,
  handler: async (ctx, { caller, goals, diet, constraints }) => {
    const patch: { goals?: string; diet?: string; constraints?: string } = {};
    if (goals != null) patch.goals = goals;
    if (diet != null) patch.diet = diet;
    if (constraints != null) patch.constraints = constraints;
    await applyToUserDoc(ctx, caller.subject, "profile.json", (s) => reducers.setProfile(s, patch));
    return `Perfil actualizado`;
  },
});
