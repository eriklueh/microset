import { query } from "./_generated/server";
import { mcpCallerValidator } from "convex-mcp-gateway";

/**
 * MCP · Fase C mínima — funciones Convex despachadas por el Gateway (SOLO lectura).
 *
 * CORRECCIÓN DURA DE IDENTIDAD (del spike): a través del Gateway, Convex DESCARTA
 * `ctx.auth` en el borde del componente, así que estas functions NO pueden leer al
 * usuario con `ctx.auth.getUserIdentity()` (como sí hacen userDocs.ts / social.ts cuando
 * la app las llama directo). El canal soportado es `identityArg`: el Gateway valida el
 * JWT de Clerk, inyecta `{ subject, claims }` en el arg `caller` (declarado con
 * `mcpCallerValidator`), lo excluye del inputSchema público y DESCARTA cualquier valor
 * que mande el cliente. Por eso `caller.subject` es el Clerk `sub` del TOKEN verificado,
 * jamás spoofeable — la regla de oro se mantiene, solo cambia el canal. `requireUserId`
 * (userDocs.ts / social.ts) se sigue usando en el `authorize` host-side, NO acá dentro.
 */

/** whoami — prueba TODA la cadena de auth sin depender de datos. */
export const whoami = query({
  args: { caller: mcpCallerValidator },
  handler: async (_ctx, { caller }) => {
    return {
      subject: caller.subject,
      message: `Conectado como ${caller.subject}`,
    };
  },
});

/**
 * list_my_docs — los file-groups de config espejados del usuario. Confirma que la
 * identidad correcta llega hasta los datos (mismo criterio que getMyDocs de userDocs.ts,
 * pero leyendo el userId del `caller` inyectado, no de `ctx.auth`).
 */
export const listMyDocs = query({
  args: { caller: mcpCallerValidator },
  handler: async (ctx, { caller }) => {
    const rows = await ctx.db
      .query("userDocs")
      .withIndex("by_user", (q) => q.eq("userId", caller.subject))
      .collect();
    return {
      subject: caller.subject,
      count: rows.length,
      groups: rows.map((r) => r.group),
    };
  },
});
