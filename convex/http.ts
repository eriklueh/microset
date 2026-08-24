import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import {
  generateProtectedResourceMetadata,
  corsHeaders,
} from "@clerk/mcp-tools/server";
import { gateway, tools, authorize, resolveIdentity, CLERK_ISSUER } from "./mcp";

/**
 * MCP · Fase C — montaje HTTP del Gateway (todo vive en el host: el componente no tiene
 * rutas propias porque Convex no propaga `ctx.auth` a su código). Ver mcp.ts.
 *
 * FAKE-DCR BRIDGE (0.11.0): claude.ai intenta auto-registrarse (RFC 7591 DCR) contra el
 * authorization server ANTES del login. La metadata RFC 8414 de Clerk NO anuncia
 * `registration_endpoint` (Clerk DCR deshabilitado), así que el connector falla antes de
 * la pantalla de Clerk. Solución: NUESTRO server anuncia su PROPIA authorization-server
 * metadata (proxya authorize/token a Clerk) + un `registration_endpoint` propio que, a
 * cada registro, devuelve un `client_id` de Clerk PRE-REGISTRADO (OAuth app pública/PKCE
 * que Erik crea en Clerk, leído de la env var `CLERK_MCP_CLIENT_ID`).
 */
const http = httpRouter();

/** Orígenes de los clientes browser de claude (para el preflight CORS del /mcp). */
const CLAUDE_ORIGINS = ["https://claude.ai", "https://claude.com"];

/**
 * Patrones de `redirect_uri` permitidos en el fake-DCR (OBLIGATORIO: sin esto cualquiera
 * podría "registrar" un client con un redirect_uri malicioso y robar auth codes). Incluye
 * claude.ai + claude.com (los connectors) y localhost (dev/desktop).
 */
const ALLOWED_REDIRECT_PATTERNS = [
  /^https:\/\/claude\.ai\//,
  /^https:\/\/claude\.com\//,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//,
];

/** Path del registration_endpoint (fake-DCR). Debe coincidir en AS-metadata y en la ruta. */
const REGISTRATION_PATH = "/oauth/register";

/**
 * Endpoint MCP (Streamable HTTP). `requireAuth: true` → un POST anónimo recibe
 * 401 + WWW-Authenticate (necesario para que claude.ai descubra el AS y arranque OAuth;
 * requiere que `mcp:setupOAuth` haya corrido). El Gateway maneja el ruteo por método,
 * la negociación de protocolo, sesiones, tools/list + tools/call, y el preflight OPTIONS.
 */
const mcp = httpAction(async (ctx, req) =>
  gateway.handleMcpRequest(ctx, req, {
    authorize,
    tools,
    requireAuth: true,
    cors: CLAUDE_ORIGINS,
    // Bug #5: validamos el bearer de Clerk NOSOTROS (JWKS, aud=MCP_RESOURCE_URL) en vez del
    // default `ctx.auth.getUserIdentity()` (que espera aud="convex" por auth.config.ts). Ver mcp.ts.
    resolveIdentity,
  }),
);
for (const path of ["/mcp", "/mcp/"]) {
  for (const method of ["POST", "GET", "DELETE", "OPTIONS"] as const) {
    http.route({ path, method, handler: mcp });
  }
}

/**
 * RFC 9728 protected-resource metadata. `authorization_servers` AHORA apunta a NUESTRO
 * origin (el AS-metadata bridge de abajo), NO directo a Clerk: así claude.ai descubre la
 * metadata puenteada (con `registration_endpoint`) en vez de la de Clerk (sin DCR). El
 * `pathPrefix` cubre el sufijo de recurso (`/mcp`) que el WWW-Authenticate del Gateway
 * agrega tras el well-known; `resource` se deriva del origin de la request.
 */
http.route({
  pathPrefix: "/.well-known/oauth-protected-resource/",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const origin = new URL(req.url).origin;
    // Con el DCR NATIVO de Clerk habilitado, apuntamos DIRECTO a Clerk (no al bridge): así Clerk
    // es el authorization server real (issuer, authorize, token y registration todos de Clerk),
    // el `iss` de la respuesta matchea la metadata (RFC 9207) y el redirect dinámico lo maneja
    // Clerk. El fake-DCR bridge (rutas de abajo) queda DORMIDO — el cliente ya no las consulta.
    const metadata = generateProtectedResourceMetadata({
      authServerUrl: CLERK_ISSUER,
      resourceUrl: `${origin}/mcp`,
    });
    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }),
});

/**
 * RFC 8414 Authorization Server Metadata — el BRIDGE. `serveAuthorizationServerMetadata`
 * fetchea el openid-configuration de Clerk (cacheado en memoria), copia
 * authorize/token/jwks (que SIGUEN apuntando a Clerk) y SUSTITUYE `registration_endpoint`
 * por el nuestro (`<origin>${REGISTRATION_PATH}`), de modo que claude.ai hace DCR contra
 * `handleClientRegistration` en vez de contra Clerk. `issuer` = nuestro origin. El
 * override `response_types_supported: ["code"]` fuerza el code-flow PKCE puro (evita el
 * híbrido con id_token, cuyo `iss` de Clerk no matchearía el issuer del bridge y sería
 * rechazado por clientes estrictos). El handler ya maneja el preflight OPTIONS.
 *
 * `scopes_supported` se RECORTA a los estándar OIDC + offline_access: Clerk anuncia además
 * `public_metadata`/`private_metadata` (scopes internos que la OAuth app no otorga), y
 * claude.ai los pedía por leer la metadata → el token exchange fallaba con `invalid_scope`
 * (el error #1 reportado de Claude+MCP). Anunciando solo estos 4, claude.ai pide solo lo
 * que la app concede.
 */
const asMetadata = httpAction(async (ctx, req) =>
  gateway.serveAuthorizationServerMetadata(ctx, req, {
    upstreamIssuer: CLERK_ISSUER,
    registrationPath: REGISTRATION_PATH,
    overrides: {
      response_types_supported: ["code"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    },
  }),
);
for (const method of ["GET", "OPTIONS"] as const) {
  http.route({
    path: "/.well-known/oauth-authorization-server",
    method,
    handler: asMetadata,
  });
}

/**
 * RFC 7591 Dynamic Client Registration — el fake-DCR. `handleClientRegistration` valida
 * los `redirect_uris` contra `ALLOWED_REDIRECT_PATTERNS` y responde SIEMPRE el mismo
 * `client_id` pre-registrado (leído de `CLERK_MCP_CLIENT_ID`). Si la env var NO está
 * seteada, un POST responde un error claro (500) SIN romper el resto del server; el
 * preflight OPTIONS sigue respondiendo CORS aunque falte la env (el client_id no se usa
 * en OPTIONS). Setear con:  npx convex env set CLERK_MCP_CLIENT_ID <id>
 */
const register = httpAction(async (ctx, req) => {
  const clientId = process.env.CLERK_MCP_CLIENT_ID;
  if (!clientId && req.method === "POST") {
    return new Response(
      JSON.stringify({
        error: "server_error",
        error_description:
          "CLERK_MCP_CLIENT_ID no está seteada en el deployment Convex. Corré: npx convex env set CLERK_MCP_CLIENT_ID <clerk-public-client-id>",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders },
      },
    );
  }
  return gateway.handleClientRegistration(ctx, req, {
    // En OPTIONS el handler corta antes de usar upstreamClientId, así que el placeholder
    // nunca se emite; en POST ya garantizamos arriba que clientId existe.
    upstreamClientId: clientId ?? "MISSING_CLERK_MCP_CLIENT_ID",
    allowedRedirectPatterns: ALLOWED_REDIRECT_PATTERNS,
  });
});
for (const method of ["POST", "OPTIONS"] as const) {
  http.route({ path: REGISTRATION_PATH, method, handler: register });
}

export default http;
