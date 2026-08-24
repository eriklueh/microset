import { defineApp } from "convex/server";
import mcpGateway from "convex-mcp-gateway/convex.config";

/**
 * MCP · Fase C — registra el componente `convex-mcp-gateway`. El componente NO tiene
 * rutas HTTP propias (Convex no propaga `ctx.auth` al código del componente): todo el
 * transporte MCP se monta en el host, en convex/http.ts. Ver docs/agent/mcp-coach.md.
 */
const app = defineApp();
app.use(mcpGateway);
export default app;
