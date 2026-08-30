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
    // 0..1 — % del plan semanal cumplido (done/planned). "¿está cumpliendo la rutina?"
    adherence: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_group_season", ["groupId", "seasonId"])
    .index("by_group_user_season", ["groupId", "userId", "seasonId"]),

  // Rutinas compartidas dentro de un grupo. El `payload` es el day-type serializado (JSON),
  // opaco para Convex: el cliente lo stringifica al compartir y lo parsea + sanitiza al copiar.
  sharedRoutines: defineTable({
    groupId: v.id("groups"),
    ownerId: v.string(), // Clerk sub del que la comparte
    ownerHandle: v.string(),
    name: v.string(),
    payload: v.string(), // day-type serializado
    updatedAt: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_group_owner", ["groupId", "ownerId"]),

  // RETO de grupo (F4). Cada grupo puede tener UN reto: un título + fecha objetivo. Solo
  // MIEMBROS del grupo lo leen/escriben (se chequea en challenges.ts). El `createdBy` es el
  // Clerk `sub` del que lo creó (único que puede borrarlo). Aditivo sobre la capa social.
  challenges: defineTable({
    groupId: v.id("groups"),
    title: v.string(),
    targetDate: v.string(), // YYYY-MM-DD
    createdBy: v.string(), // Clerk sub
    createdAt: v.number(),
  }).index("by_group", ["groupId"]),

  // El OBJETIVO físico de un miembro dentro de un reto. Descripción libre + una métrica
  // numérica OPCIONAL (label/unit/start/target — p.ej. "Peso" kg 82→75). Cada quien escribe
  // SOLO su propia fila (userId del token). Upsert por (challengeId, userId).
  challengeGoals: defineTable({
    challengeId: v.id("challenges"),
    userId: v.string(), // Clerk sub — el cliente nunca puede escribir otro
    handle: v.string(),
    description: v.string(),
    metricLabel: v.optional(v.string()),
    metricUnit: v.optional(v.string()),
    metricStart: v.optional(v.number()),
    metricTarget: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_challenge", ["challengeId"])
    .index("by_challenge_user", ["challengeId", "userId"]),

  // CHECK-IN de progreso de un miembro en un reto: valor actual (numérico) y/o % auto-reportado
  // + nota. Se insertan (append-only); la vista usa el ÚLTIMO por usuario. userId del token.
  challengeCheckins: defineTable({
    challengeId: v.id("challenges"),
    userId: v.string(), // Clerk sub — el cliente nunca puede escribir otro
    at: v.number(),
    currentValue: v.optional(v.number()),
    progressPct: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_challenge", ["challengeId"])
    .index("by_challenge_user", ["challengeId", "userId"]),

  // SYNC Fase A · "archivos mandan, Convex espeja". Espejo por-usuario de los documentos de
  // config (los file-groups de src/store/files.ts). `data` es el JSON del file-group serializado,
  // OPACO para Convex (no se parsea). `group` es el nombre del file-group (p.ej. "routine.json").
  // `rev` es un contador monotónico por (userId, group); la resolución LWW real llega en Fase B.
  // Aditivo: nada en la app lo consume todavía.
  userDocs: defineTable({
    userId: v.string(), // Clerk sub — el cliente nunca puede escribir otro
    group: v.string(),
    data: v.string(), // JSON opaco del file-group
    rev: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_group", ["userId", "group"]),

  // PERFIL DEL ATLETA (F4). Las rutinas (day-types) que un usuario hace VISIBLES a sus grupos
  // — opt-in POR rutina. Reemplaza el "pozo plano" de sharedRoutines por navegación por persona:
  // en un grupo se abre el perfil de un atleta y se ven SUS rutinas visibles. `payload` es un
  // JSON array de day-types serializados (via serializeDayType), OPACO para Convex: el cliente lo
  // stringifica al publicar y lo parsea + sanitiza (parseSharedRoutine) al copiar. UNA fila por
  // usuario (upsert by_user); el `userId` sale SIEMPRE del token. Aditivo sobre la capa social.
  athleteRoutines: defineTable({
    userId: v.string(), // Clerk sub — el cliente nunca puede escribir otro
    handle: v.string(),
    payload: v.string(), // JSON array de day-types visibles serializados
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
