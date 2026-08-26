import { components, api } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  McpGateway,
  defineMcpQuery,
  defineMcpMutation,
  mcpCallerValidator,
  type McpToolRegistration,
  type McpAuthorizerHandler,
  type McpIdentityResolver,
} from "convex-mcp-gateway";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";
import * as cw from "./coachWrite";

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
 * Los tools de lectura (whoami/list_my_docs) y los de ESCRITURA (coach.*) usan
 * `identityArg: "caller"`: el Gateway inyecta la identidad verificada (Clerk `sub`) en el arg
 * `caller` y descarta cualquier valor del cliente. Cada tool de escritura hace read-modify-write
 * de UN userDoc del PROPIO usuario reusando los reducers + sanitizers puros (ver coachWrite.ts).
 * Ningún tool recibe `userId`/`docId`. Sin tools de escritura para `logs`/`coach`/`entreno`.
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

  // ── ESCRITURA · doc equipment ──────────────────────────────────────────────
  defineMcpMutation({
    name: "add_equipment",
    description:
      "Crea un equipo propio custom (p.ej. anillas, kettlebell, agarre). Lo marca como que lo tenés.",
    fn: api.coachWrite.addEquipment,
    args: cw.addEquipmentArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_equipment_owned",
    description: "Marca un equipo (por id) como que lo tenés o no lo tenés.",
    fn: api.coachWrite.setEquipmentOwned,
    args: cw.setEquipmentOwnedArgs,
    identityArg: "caller",
  }),

  // ── ESCRITURA · doc exercises ──────────────────────────────────────────────
  defineMcpMutation({
    name: "add_exercise",
    description:
      "Crea un ejercicio custom. context 'desk' = silencioso/sin setup (sirve en reuniones); 'space' = necesita lugar. En primary/secondary van los músculos específicos (para el mapa corporal).",
    fn: api.coachWrite.addExercise,
    args: cw.addExerciseArgs,
    identityArg: "caller",
  }),

  // ── ESCRITURA · doc routine ────────────────────────────────────────────────
  defineMcpMutation({
    name: "add_to_routine",
    description: "Agrega un ejercicio a la rutina de un tipo de día (dedup por exerciseId).",
    fn: api.coachWrite.addToRoutine,
    args: cw.addToRoutineArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "remove_from_routine",
    description: "Quita un ejercicio de la rutina de un tipo de día.",
    fn: api.coachWrite.removeFromRoutine,
    args: cw.removeFromRoutineArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_routine_sets",
    description: "Fija la cantidad de series diarias de un ejercicio en un tipo de día.",
    fn: api.coachWrite.setRoutineSets,
    args: cw.setRoutineSetsArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_routine_target",
    description: "Fija las reps/duración de un ejercicio en un tipo de día (p.ej. '5' o '20s').",
    fn: api.coachWrite.setRoutineTarget,
    args: cw.setRoutineTargetArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_routine_variant",
    description: "Fija la variante de intensidad de un ejercicio en un tipo de día.",
    fn: api.coachWrite.setRoutineVariant,
    args: cw.setRoutineVariantArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_routine_order",
    description:
      "Fija el orden en que se recorren los ejercicios de un tipo de día (round-robin). Pasá los exerciseIds en el orden deseado.",
    fn: api.coachWrite.setRoutineOrder,
    args: cw.setRoutineOrderArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "add_day_type",
    description: "Crea un tipo de día (plantilla de rutina) vacío. Devuelve su id.",
    fn: api.coachWrite.addDayType,
    args: cw.addDayTypeArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "rename_day_type",
    description: "Renombra un tipo de día.",
    fn: api.coachWrite.renameDayType,
    args: cw.renameDayTypeArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "remove_day_type",
    description:
      "Elimina un tipo de día (tiene que quedar al menos uno; las refs de la semana pasan al fallback).",
    fn: api.coachWrite.removeDayType,
    args: cw.removeDayTypeArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_week",
    description: "Asigna un tipo de día (o 'rest') a un día de la semana. index 0=Lun … 6=Dom.",
    fn: api.coachWrite.setWeek,
    args: cw.setWeekArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_day_kind",
    description: "Etiqueta un día de la semana como casa/oficina (o lo limpia). index 0=Lun … 6=Dom.",
    fn: api.coachWrite.setDayKind,
    args: cw.setDayKindArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_day_override",
    description:
      "Planifica una fecha específica ('YYYY-M-D'), pisando el patrón semanal solo ese día. slot = tipo de día o 'rest'; kind = casa/oficina/none. Omití slot o kind para heredar del patrón.",
    fn: api.coachWrite.setDayOverride,
    args: cw.setDayOverrideArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "clear_day_override",
    description: "Quita el override de una fecha — ese día vuelve al patrón semanal.",
    fn: api.coachWrite.clearDayOverride,
    args: cw.clearDayOverrideArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_intensity",
    description:
      "Fija la INTENSIDAD de un tipo de día (perilla de volumen no destructiva): 'deload' ~mitad de series, 'normal' = lo configurado, 'push' ~1.5×.",
    fn: api.coachWrite.setIntensity,
    args: cw.setIntensityArgs,
    identityArg: "caller",
  }),
  defineMcpMutation({
    name: "set_day_schedule",
    description:
      "Le da a un tipo de día su PROPIA ventana horaria + descanso (minutos desde medianoche) para agrupar sus series en una sesión. useGlobal:true limpia el override y vuelve al global. windowStart+windowEnd van juntos.",
    fn: api.coachWrite.setDaySchedule,
    args: cw.setDayScheduleArgs,
    identityArg: "caller",
  }),

  // ── ESCRITURA · doc settings (solo workWindow/minRest) ─────────────────────
  defineMcpMutation({
    name: "set_settings",
    description:
      "Actualiza la ventana de trabajo / descanso mínimo (minutos desde medianoche). Solo toca workWindow y minRest; nunca theme/módulos/notificaciones.",
    fn: api.coachWrite.setSettings,
    args: cw.setSettingsArgs,
    identityArg: "caller",
  }),

  // ── ESCRITURA · doc profile ────────────────────────────────────────────────
  defineMcpMutation({
    name: "set_profile",
    description: "Actualiza el perfil del coach (objetivos / dieta / restricciones).",
    fn: api.coachWrite.setProfile,
    args: cw.setProfileArgs,
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
 * Verificamos firma + issuer + expiración contra el JWKS público de Clerk, y la audiencia
 * SOLO si el token la trae (Claude Code CLI no pide `resource=`, así que Clerk no emite
 * `aud`; el connector de claude.ai sí). Sin secret. `null` ⇒ token rechazado (el Gateway lo trata igual que "sin token"). La regla de
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
    });
    // `aud` es OPCIONAL: Clerk solo la emite si el cliente pidió el token con `resource=`
    // (RFC 8707). El connector de claude.ai lo manda; Claude Code (CLI) NO, así que su token
    // llega SIN `aud` y exigirla rechazaba tokens perfectamente válidos. Si viene, tiene que
    // ser nuestro recurso; si no viene, alcanza con firma + issuer (el JWKS es de NUESTRO Clerk).
    const aud = payload.aud;
    if (aud !== undefined) {
      const audiences = Array.isArray(aud) ? aud : [aud];
      if (!audiences.includes(MCP_RESOURCE_URL)) {
        console.log(
          `resolveIdentity FAIL: aud=${JSON.stringify(aud)} (esperado ${MCP_RESOURCE_URL})`,
        );
        return null;
      }
    }
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
