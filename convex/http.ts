import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import {
  generateProtectedResourceMetadata,
  corsHeaders,
} from "@clerk/mcp-tools/server";
import { gateway, tools, authorize, CLERK_ISSUER } from "./mcp";

/**
 * MCP · Fase C mínima — montaje HTTP del Gateway (todo vive en el host: el componente no
 * tiene rutas propias porque Convex no propaga `ctx.auth` a su código). Ver mcp.ts.
 */
const http = httpRouter();

/** Orígenes de los clientes browser de claude (para el preflight CORS). */
const CLAUDE_ORIGINS = ["https://claude.ai", "https://claude.com"];

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
  }),
);
for (const path of ["/mcp", "/mcp/"]) {
  for (const method of ["POST", "GET", "DELETE", "OPTIONS"] as const) {
    http.route({ path, method, handler: mcp });
  }
}

/**
 * RFC 9728 protected-resource metadata → apunta al Clerk de auth.config.ts como
 * authorization server. Construida con @clerk/mcp-tools. `pathPrefix` cubre el sufijo de
 * recurso (`/mcp`) que el WWW-Authenticate del Gateway agrega tras el well-known. El
 * `resource` se deriva del origin de la request para que coincida con `MCP_RESOURCE_URL`.
 */
http.route({
  pathPrefix: "/.well-known/oauth-protected-resource/",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const origin = new URL(req.url).origin;
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

export default http;
