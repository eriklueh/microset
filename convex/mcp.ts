import { components, api } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  McpGateway,
  defineMcpQuery,
  mcpCallerValidator,
  type McpToolRegistration,
  type McpAuthorizerHandler,
} from "convex-mcp-gateway";

/**
 * MCP · Fase C mínima — wiring del Gateway: catálogo de tools, authorize host-side y la
 * config de OAuth discovery. El montaje HTTP (/mcp y el well-known) vive en convex/http.ts.
 * Ver docs/agent/mcp-coach.md.
 */

/** Clerk issuer OIDC — el MISMO de convex/auth.config.ts (Frontend API URL). */
export const CLERK_ISSUER = "https://becoming-bison-9194.clerk.accounts.dev";

/** URI del recurso MCP (deployment DEV, dominio de HTTP actions). */
export const MCP_RESOURCE_URL = "https://rapid-kiwi-381.convex.site/mcp";

export const gateway = new McpGateway(components.mcpGateway);

/**
 * Catálogo declarativo de tools. El Gateway reconcilia el registro en `initialize`
 * (change-detected), así que se edita esta lista en código y aplica al siguiente connect
 * — sin mutation de registro aparte. Anotado como `McpToolRegistration[]` para evitar el
 * error de tipo circular del codegen de Convex al exportarlo desde un módulo de convex/.
 *
 * Ambos tools son de SOLO lectura y usan `identityArg: "caller"`: el Gateway inyecta la
 * identidad verificada. Fase B agregará tools que escriben (coach.*).
 */
export const tools: McpToolRegistration[] = [
  defineMcpQuery({
    name: "whoami",
    description:
      "Devuelve la identidad del usuario autenticado (Clerk sub). Prueba la cadena de auth de punta a punta.",
    fn: api.coach.whoami,
    args: { caller: mcpCallerValidator },
    identityArg: "caller",
  }),
  defineMcpQuery({
    name: "list_my_docs",
    description:
      "Lista los file-groups de config espejados del usuario autenticado.",
    fn: api.coach.listMyDocs,
    args: { caller: mcpCallerValidator },
    identityArg: "caller",
  }),
];

/**
 * Authorize host-side (corre en el contexto de la HTTP action, con `ctx.auth` funcional).
 * Deny-by-default: solo callers autenticados. Usa la `identity` ya resuelta en el borde
 * (preferible a llamar `ctx.auth.getUserIdentity()` acá: sirve en modo JWT puro y en bridge).
 */
export const authorize: McpAuthorizerHandler = async (_ctx, { identity }) => {
  if (!identity) return { allowed: false, reason: "No autenticado" };
  return { allowed: true };
};

/**
 * Corré UNA vez tras el deploy: configura la OAuth 2.1 protected-resource discovery.
 * Con esto (y `requireAuth: true` en http.ts) un POST anónimo a /mcp devuelve
 * 401 + `WWW-Authenticate: Bearer resource_metadata=...` — el disparador que hace que
 * claude.ai arranque el flujo OAuth contra Clerk. Sin esto el 401 va sin el header.
 *
 *   npx convex run mcp:setupOAuth
 */
export const setupOAuth = internalMutation({
  args: {},
  handler: async (ctx) => {
    await gateway.setOAuthConfig(ctx, {
      authServerUrl: CLERK_ISSUER,
      resourceUrl: MCP_RESOURCE_URL,
    });
    return { ok: true, authServerUrl: CLERK_ISSUER, resourceUrl: MCP_RESOURCE_URL };
  },
});
