import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * SYNC Fase A · "archivos mandan, Convex espeja" — espejo por-usuario de los documentos
 * de config (los file-groups de la app). Ver docs/agent/mcp-coach.md.
 *
 * Regla dura (igual que social.ts): cada quien escribe SOLO sus propios docs. El `userId`
 * sale SIEMPRE del token verificado (Clerk `sub` vía ctx.auth), NUNCA de un argumento del
 * cliente. `data` es JSON OPACO — Convex no lo parsea ni lo valida. Aditivo: nada en la app
 * lo consume todavía; la resolución de conflictos LWW real es de la Fase B.
 */

/** El Clerk `sub` del usuario autenticado, o error. */
async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");
  return identity.subject;
}

/**
 * Los file-groups de config válidos. DEBE quedar en sync con CONFIG_GROUPS de
 * src/store/files.ts (los `.name` de REGISTRY que NO son readonly-derivados —
 * excluye "context.json"). Son los valores válidos de `group`.
 */
const VALID_GROUPS = new Set<string>([
  "settings.json",
  "routine.json",
  "equipment.json",
  "exercises.json",
  "profile.json",
  "coach.json",
  "logs.json",
  "entreno.json",
]);

/** Todos MIS documentos de config espejados. */
export const getMyDocs = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const rows = await ctx.db
      .query("userDocs")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    return rows.map((r) => ({
      group: r.group,
      data: r.data,
      rev: r.rev,
      updatedAt: r.updatedAt,
    }));
  },
});

/** MI documento de un file-group, o null si no existe. */
export const getMyDoc = query({
  args: { group: v.string() },
  handler: async (ctx, { group }) => {
    const me = await requireUserId(ctx);
    const row = await ctx.db
      .query("userDocs")
      .withIndex("by_user_group", (q) => q.eq("userId", me).eq("group", group))
      .first();
    if (!row) return null;
    return { group: row.group, data: row.data, rev: row.rev, updatedAt: row.updatedAt };
  },
});

/**
 * Upsert de MI documento de un file-group (por userId + group). `data` es JSON opaco:
 * se guarda tal cual, NO se parsea. `rev` es un contador monotónico (existente + 1).
 * La resolución de conflictos LWW real es de la Fase B — acá siempre pisa.
 */
export const upsertMyDoc = mutation({
  args: { group: v.string(), data: v.string() },
  handler: async (ctx, { group, data }) => {
    const me = await requireUserId(ctx);
    if (!VALID_GROUPS.has(group)) throw new Error(`file-group inválido: ${group}`);
    const existing = await ctx.db
      .query("userDocs")
      .withIndex("by_user_group", (q) => q.eq("userId", me).eq("group", group))
      .first();
    const rev = (existing?.rev ?? 0) + 1;
    const row = {
      userId: me, // del token — el cliente NO puede escribir otro
      group,
      data, // JSON opaco — no se parsea
      rev,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("userDocs", row);
    return { rev };
  },
});
