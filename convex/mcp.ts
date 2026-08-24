import { components, api } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  McpGateway,
  defineMcpQuery,
  mcpCallerValidator,
  type McpToolRegistration,
  type McpAuthorizerHandler,
  type McpIdentityResolver,
} from "convex-mcp-gateway";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";

/**
 * MCP · Fase C mínima — wiring del Gateway: catálogo de tools, authorize host-side y la
 * config de OAuth discovery. El montaje HTTP (/mcp y el well-known) vive en convex/http.ts.
 * Ver docs/agent/mcp-coach.md.
 */

/** Clerk issuer OIDC — el MISMO de convex/auth.config.ts (Frontend API URL). */
export const CLERK_ISSUER = "https://becoming-bison-9194.clerk.accounts.dev";

/** Origin de NUESTRO server (deployment DEV, dominio de HTTP actions). Es también el
 * issuer de nuestro authorization-server metadata bridge (ver convex/http.ts). */
export const MCP_ORIGIN = "https://rapid-kiwi-381.convex.site";

/** URI del recurso MCP (deployment DEV, dominio de HTTP actions). */
export const MCP_RESOURCE_URL = `${MCP_ORIGIN}/mcp`;

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
 * JWKS público de Clerk (issuer OIDC). `createRemoteJWKSet` es lazy (no fetchea hasta el
 * primer verify) y cachea las claves en memoria del isolate, así que declararlo a nivel de
 * módulo es barato y no toca red en el init. Verificación por firma + JWKS ⇒ SIN secret.
 */
const CLERK_JWKS = createRemoteJWKSet(
  new URL(`${CLERK_ISSUER}/.well-known/jwks.json`),
);

/**
 * resolveIdentity — escape hatch del Gateway (`handleMcpRequest({ resolveIdentity })`).
 *
 * POR QUÉ EXISTE (bug #5): el connector pide el token con `resource=<MCP_RESOURCE_URL>`
 * (RFC 8707), así que Clerk emite el access token con `aud = MCP_RESOURCE_URL`. El default
 * del Gateway resuelve identidad con `ctx.auth.getUserIdentity()`, que valida contra
 * `auth.config.ts` (applicationID "convex" ⇒ espera `aud="convex"`). Mismatch de audiencia
 * ⇒ `getUserIdentity()=null` ⇒ /mcp rechaza ⇒ "authorization failed". Acá validamos NOSOTROS
 * el bearer con la `aud` correcta.
 *
 * El Gateway ya extrae el bearer del header `Authorization` y nos pasa SOLO el token string.
 * Verificamos firma + issuer + audience + expiración contra el JWKS público de Clerk (sin
 * secret). `null` ⇒ token rechazado (el Gateway lo trata igual que "sin token"). La regla de
 * oro se mantiene: el `subject` sale del token verificado, jamás de un arg del cliente.
 *
 * NOTA: NO se usa `verifyClerkToken` de @clerk/mcp-tools: esa función NO verifica el JWT,
 * solo reformatea un `auth` YA autenticado por `@clerk/backend` (que exige CLERK_SECRET_KEY).
 * La verificación por JWKS de acá cumple el mismo objetivo sin secret.
 */
export const resolveIdentity: McpIdentityResolver = async (token) => {
  console.log(`resolveIdentity: token recibido (len=${token?.length ?? 0})`);
  try {
    const { payload } = await jwtVerify(token, CLERK_JWKS, {
      issuer: CLERK_ISSUER,
      audience: MCP_RESOURCE_URL,
    });
    if (!payload.sub) {
      console.log("resolveIdentity FAIL: token válido pero sin claim `sub`");
      return null;
    }
    console.log(`resolveIdentity OK sub=${payload.sub}`);
    return { subject: payload.sub, claims: payload as Record<string, unknown> };
  } catch (err) {
    let detail = err instanceof Error ? err.message : String(err);
    // Decodificar SIN verificar solo para diagnosticar (nunca se confía en esto):
    // mostrar el iss/aud reales suele revelar al toque un mismatch de audiencia.
    try {
      const claims = decodeJwt(token);
      detail += ` | iss=${claims.iss ?? "?"} aud=${JSON.stringify(claims.aud ?? "?")} (esperado iss=${CLERK_ISSUER} aud=${MCP_RESOURCE_URL})`;
    } catch {
      detail += " | token no decodificable (no es un JWT)";
    }
    console.log(`resolveIdentity FAIL: ${detail}`);
    return null;
  }
};

/**
 * Corré UNA vez tras el deploy: configura la OAuth 2.1 protected-resource discovery.
 * Con esto (y `requireAuth: true` en http.ts) un POST anónimo a /mcp devuelve
 * 401 + `WWW-Authenticate: Bearer resource_metadata=...` — el disparador que hace que
 * claude.ai arranque el flujo OAuth. Sin esto el 401 va sin el header.
 *
 * `authServerUrl` apunta a NUESTRO origin (el AS-metadata bridge de http.ts), NO directo
 * a Clerk: coherente con la PRM que servimos, para que claude.ai haga fake-DCR contra
 * nuestro `registration_endpoint`. Re-corré tras deploy si cambió:
 *
 *   npx convex run mcp:setupOAuth
 */
export const setupOAuth = internalMutation({
  args: {},
  handler: async (ctx) => {
    await gateway.setOAuthConfig(ctx, {
      authServerUrl: MCP_ORIGIN,
      resourceUrl: MCP_RESOURCE_URL,
    });
    return { ok: true, authServerUrl: MCP_ORIGIN, resourceUrl: MCP_RESOURCE_URL };
  },
});
