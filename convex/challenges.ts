import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * RETO de grupo (F4) — un reto por grupo con título + fecha objetivo. Cada miembro fija su
 * OBJETIVO físico (descripción + métrica numérica opcional) y loguea CHECK-INS de progreso.
 * Ver docs/VISION.md §6 (Social). Aditivo sobre la capa social (social.ts).
 *
 * Regla dura (igual que social.ts): el `userId` sale SIEMPRE del token verificado (Clerk `sub`
 * vía ctx.auth), NUNCA de un argumento del cliente. Solo MIEMBROS del grupo leen/escriben el
 * reto; cada quien escribe SOLO su propio objetivo/check-in.
 */

/** El Clerk `sub` del usuario autenticado, o error. */
async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("No autenticado");
  return identity.subject;
}

/** Exige que `userId` sea miembro de `groupId`; error si no. */
async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  userId: string,
): Promise<void> {
  const mem = await ctx.db
    .query("memberships")
    .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", userId))
    .first();
  if (!mem) throw new Error("No sos miembro de este grupo");
}

/** Carga el challenge por id o lanza error si no existe. */
async function getChallengeOrThrow(ctx: QueryCtx | MutationCtx, challengeId: Id<"challenges">) {
  const challenge = await ctx.db.get(challengeId);
  if (!challenge) throw new Error("El reto no existe");
  return challenge;
}

/**
 * El reto de un grupo (o null si no hay), con el objetivo + último check-in de cada miembro.
 * Requiere ser miembro del grupo.
 */
export const getGroupChallenge = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUserId(ctx);
    await requireMembership(ctx, groupId, me);

    const challenge = await ctx.db
      .query("challenges")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .first();
    if (!challenge) return null;

    const goals = await ctx.db
      .query("challengeGoals")
      .withIndex("by_challenge", (q) => q.eq("challengeId", challenge._id))
      .collect();

    const entries = await Promise.all(
      goals.map(async (g) => {
        // El ÚLTIMO check-in de este usuario en este reto.
        const checkins = await ctx.db
          .query("challengeCheckins")
          .withIndex("by_challenge_user", (q) =>
            q.eq("challengeId", challenge._id).eq("userId", g.userId),
          )
          .collect();
        const last = checkins.reduce<(typeof checkins)[number] | null>(
          (acc, c) => (acc === null || c.at > acc.at ? c : acc),
          null,
        );
        const metric =
          g.metricLabel !== undefined
            ? {
                label: g.metricLabel,
                unit: g.metricUnit ?? null,
                start: g.metricStart ?? null,
                target: g.metricTarget ?? null,
              }
            : null;
        return {
          userId: g.userId,
          handle: g.handle,
          description: g.description,
          metric,
          latest: last
            ? {
                at: last.at,
                currentValue: last.currentValue ?? null,
                progressPct: last.progressPct ?? null,
                note: last.note ?? null,
              }
            : null,
          isMe: g.userId === me,
        };
      }),
    );

    return {
      challenge: {
        id: challenge._id,
        title: challenge.title,
        targetDate: challenge.targetDate,
        createdBy: challenge.createdBy,
        createdAt: challenge.createdAt,
      },
      entries,
    };
  },
});

/** Crear el reto del grupo (uno solo por grupo). Requiere ser miembro. */
export const createChallenge = mutation({
  args: { groupId: v.id("groups"), title: v.string(), targetDate: v.string() },
  handler: async (ctx, { groupId, title, targetDate }) => {
    const me = await requireUserId(ctx);
    await requireMembership(ctx, groupId, me);

    const existing = await ctx.db
      .query("challenges")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .first();
    if (existing) throw new Error("Este grupo ya tiene un reto activo");

    const challengeId = await ctx.db.insert("challenges", {
      groupId,
      title,
      targetDate,
      createdBy: me, // del token — el cliente NO puede escribir otro
      createdAt: Date.now(),
    });
    return { challengeId };
  },
});

/** Borrar el reto (solo el que lo creó). Limpia también goals + check-ins. */
export const deleteChallenge = mutation({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, { challengeId }) => {
    const me = await requireUserId(ctx);
    const challenge = await getChallengeOrThrow(ctx, challengeId);
    if (challenge.createdBy !== me) throw new Error("Solo quien creó el reto puede borrarlo");

    const goals = await ctx.db
      .query("challengeGoals")
      .withIndex("by_challenge", (q) => q.eq("challengeId", challengeId))
      .collect();
    for (const g of goals) await ctx.db.delete(g._id);

    const checkins = await ctx.db
      .query("challengeCheckins")
      .withIndex("by_challenge", (q) => q.eq("challengeId", challengeId))
      .collect();
    for (const c of checkins) await ctx.db.delete(c._id);

    await ctx.db.delete(challengeId);
  },
});

/**
 * Fijar/actualizar MI objetivo en un reto (upsert por challenge+yo). Descripción libre +
 * métrica numérica opcional. Requiere ser miembro del grupo del reto.
 */
export const setMyGoal = mutation({
  args: {
    challengeId: v.id("challenges"),
    handle: v.string(),
    description: v.string(),
    metricLabel: v.optional(v.string()),
    metricUnit: v.optional(v.string()),
    metricStart: v.optional(v.number()),
    metricTarget: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const challenge = await getChallengeOrThrow(ctx, args.challengeId);
    await requireMembership(ctx, challenge.groupId, me);

    const row = {
      challengeId: args.challengeId,
      userId: me, // del token — el cliente NO puede escribir otro
      handle: args.handle,
      description: args.description,
      metricLabel: args.metricLabel,
      metricUnit: args.metricUnit,
      metricStart: args.metricStart,
      metricTarget: args.metricTarget,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("challengeGoals")
      .withIndex("by_challenge_user", (q) =>
        q.eq("challengeId", args.challengeId).eq("userId", me),
      )
      .first();
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("challengeGoals", row);
  },
});

/**
 * Loguear un CHECK-IN de progreso (valor actual y/o % + nota). Append-only; la vista usa el
 * último por usuario. Requiere ser miembro del grupo del reto. userId del token.
 */
export const addCheckin = mutation({
  args: {
    challengeId: v.id("challenges"),
    currentValue: v.optional(v.number()),
    progressPct: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUserId(ctx);
    const challenge = await getChallengeOrThrow(ctx, args.challengeId);
    await requireMembership(ctx, challenge.groupId, me);

    await ctx.db.insert("challengeCheckins", {
      challengeId: args.challengeId,
      userId: me, // del token — el cliente NO puede escribir otro
      at: Date.now(),
      currentValue: args.currentValue,
      progressPct: args.progressPct,
      note: args.note,
    });
  },
});
