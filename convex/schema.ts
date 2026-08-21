import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * BASE · capa social opcional (F4). Ver docs/VISION.md §6 (Social).
 *
 * Solo viajan STATS DERIVADAS de entreno — nunca logs crudos, nunca nutrición. La identidad
 * del usuario es el Clerk `sub` (string), no un uuid. Cada quien escribe SOLO su propia fila
 * de `standings` (se chequea en la mutation con ctx.auth.getUserIdentity()).
 */
export default defineSchema({
  // Un grupo de amigos. Se une por inviteCode. La temporada (seasonId) rota semanalmente.
  groups: defineTable({
    name: v.string(),
    ownerId: v.string(), // Clerk sub del creador
    inviteCode: v.string(),
    seasonId: v.string(), // "AAAA-Wnn"
  }).index("by_invite", ["inviteCode"]),

  // Quién pertenece a qué grupo.
  memberships: defineTable({
    groupId: v.id("groups"),
    userId: v.string(), // Clerk sub
    role: v.union(v.literal("owner"), v.literal("member")),
  })
    .index("by_group", ["groupId"])
    .index("by_user", ["userId"])
    .index("by_group_user", ["groupId", "userId"]),

  // La fila de la liga por usuario/grupo/temporada — SOLO stats derivadas de entreno.
  standings: defineTable({
    groupId: v.id("groups"),
    userId: v.string(), // Clerk sub — el cliente nunca puede escribir otro
    seasonId: v.string(),
    handle: v.string(),
    formaElo: v.number(),
    streak: v.number(),
    level: v.number(),
    weeklyEffort: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_season", ["groupId", "seasonId"])
    .index("by_group_user_season", ["groupId", "userId", "seasonId"]),
});
