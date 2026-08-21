import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * BASE · capa social (F4) — functions de la liga de amigos. Ver docs/VISION.md §6.
 *
 * Regla dura: cada quien escribe SOLO su propia fila. El `userId` sale SIEMPRE del token
 * verificado (Clerk `sub` vía ctx.auth), nunca de un argumento del cliente. Leer/escribir
 * requiere ser miembro del grupo. Acá solo viajan stats derivadas de entreno.
 */

/** El Clerk `sub` del usuario autenticado, o error. */
async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");
  return identity.subject;
}

/** Código de invitación legible (sin caracteres ambiguos). */
function genInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Crear un grupo → te agrega como owner y devuelve el código de invitación. */
export const createGroup = mutation({
  args: { name: v.string(), seasonId: v.string() },
  handler: async (ctx, { name, seasonId }) => {
    const me = await requireUserId(ctx);
    let inviteCode = genInviteCode();
    while (
      await ctx.db
        .query("groups")
        .withIndex("by_invite", (q) => q.eq("inviteCode", inviteCode))
        .first()
    ) {
      inviteCode = genInviteCode();
    }
    const groupId = await ctx.db.insert("groups", { name, ownerId: me, inviteCode, seasonId });
    await ctx.db.insert("memberships", { groupId, userId: me, role: "member" });
    // el owner también es "member" para las lecturas; su rol de owner queda marcado:
    await ctx.db.patch(
      (await ctx.db
        .query("memberships")
        .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", me))
        .first())!._id,
      { role: "owner" },
    );
    return { groupId, inviteCode };
  },
});

/** Unirse a un grupo por código. Idempotente (si ya sos miembro, no duplica). */
export const joinGroup = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const me = await requireUserId(ctx);
    const group = await ctx.db
      .query("groups")
      .withIndex("by_invite", (q) => q.eq("inviteCode", inviteCode.trim().toUpperCase()))
      .first();
    if (!group) throw new Error("Código de invitación inválido");
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_group_user", (q) => q.eq("groupId", group._id).eq("userId", me))
      .first();
    if (!existing) {
      await ctx.db.insert("memberships", { groupId: group._id, userId: me, role: "member" });
    }
    return { groupId: group._id, name: group.name };
  },
});

/** Salir de un grupo (borra tu membership + tus standings de ese grupo). */
export const leaveGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUserId(ctx);
    const mem = await ctx.db
      .query("memberships")
      .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", me))
      .first();
    if (mem) await ctx.db.delete(mem._id);
    const mine = await ctx.db
      .query("standings")
      .withIndex("by_group_user_season", (q) => q.eq("groupId", groupId).eq("userId", me))
      .collect();
    for (const row of mine) await ctx.db.delete(row._id);
  },
});

/** Los grupos a los que pertenezco. */
export const listMyGroups = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUserId(ctx);
    const mems = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    const groups = await Promise.all(mems.map((m) => ctx.db.get(m.groupId)));
    return groups
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .map((g) => ({ id: g._id, name: g.name, inviteCode: g.inviteCode }));
  },
});

/** Publicar MI fila de standings (upsert por grupo+yo+temporada). Solo stats derivadas. */
export const upsertMyStandings = mutation({
  args: {
    groupId: v.id("groups"),
    seasonId: v.string(),
    handle: v.string(),
    formaElo: v.number(),
    streak: v.number(),
    level: v.number(),
    weeklyEffort: v.number(),
    adherence: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const mem = await ctx.db
      .query("memberships")
      .withIndex("by_group_user", (q) => q.eq("groupId", args.groupId).eq("userId", me))
      .first();
    if (!mem) throw new Error("No sos miembro de este grupo");
    const row = {
      groupId: args.groupId,
      userId: me, // del token — el cliente NO puede escribir otro
      seasonId: args.seasonId,
      handle: args.handle,
      formaElo: args.formaElo,
      streak: args.streak,
      level: args.level,
      weeklyEffort: args.weeklyEffort,
      adherence: args.adherence,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("standings")
      .withIndex("by_group_user_season", (q) =>
        q.eq("groupId", args.groupId).eq("userId", me).eq("seasonId", args.seasonId),
      )
      .first();
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("standings", row);
  },
});

/** La tabla de la liga de un grupo para una temporada (ordenada por esfuerzo semanal). */
export const listGroupStandings = query({
  args: { groupId: v.id("groups"), seasonId: v.string() },
  handler: async (ctx, { groupId, seasonId }) => {
    const me = await requireUserId(ctx);
    const mem = await ctx.db
      .query("memberships")
      .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", me))
      .first();
    if (!mem) throw new Error("No sos miembro de este grupo");
    const rows = await ctx.db
      .query("standings")
      .withIndex("by_group_season", (q) => q.eq("groupId", groupId).eq("seasonId", seasonId))
      .collect();
    return rows
      .map((r) => ({
        userId: r.userId,
        handle: r.handle,
        formaElo: r.formaElo,
        streak: r.streak,
        level: r.level,
        weeklyEffort: r.weeklyEffort,
        adherence: r.adherence ?? 0,
        isMe: r.userId === me,
      }))
      .sort((a, b) => b.weeklyEffort - a.weeklyEffort);
  },
});

/**
 * Compartir una rutina (day-type serializado en `payload`) con un grupo. Upsert por
 * (grupo, yo, nombre) — re-compartir con el mismo nombre actualiza. El payload es opaco:
 * el cliente lo stringifica al compartir y lo parsea + sanitiza al copiar.
 */
export const shareRoutine = mutation({
  args: { groupId: v.id("groups"), name: v.string(), payload: v.string(), handle: v.string() },
  handler: async (ctx, { groupId, name, payload, handle }) => {
    const me = await requireUserId(ctx);
    const mem = await ctx.db
      .query("memberships")
      .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", me))
      .first();
    if (!mem) throw new Error("No sos miembro de este grupo");
    const mine = await ctx.db
      .query("sharedRoutines")
      .withIndex("by_group_owner", (q) => q.eq("groupId", groupId).eq("ownerId", me))
      .collect();
    const existing = mine.find((r) => r.name === name);
    const row = { groupId, ownerId: me, ownerHandle: handle, name, payload, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("sharedRoutines", row);
  },
});

/** Las rutinas compartidas en un grupo (para ver / copiar). */
export const listGroupRoutines = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUserId(ctx);
    const mem = await ctx.db
      .query("memberships")
      .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", me))
      .first();
    if (!mem) throw new Error("No sos miembro de este grupo");
    const rows = await ctx.db
      .query("sharedRoutines")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    return rows
      .map((r) => ({
        id: r._id,
        ownerHandle: r.ownerHandle,
        name: r.name,
        payload: r.payload,
        mine: r.ownerId === me,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Dejar de compartir una de MIS rutinas. */
export const unshareRoutine = mutation({
  args: { id: v.id("sharedRoutines") },
  handler: async (ctx, { id }) => {
    const me = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (row && row.ownerId === me) await ctx.db.delete(id);
  },
});
