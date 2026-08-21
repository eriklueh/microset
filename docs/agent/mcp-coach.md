# Fase C — MCP Coach: plan y data

> Documento de diseño para revisar ANTES de codear. Síntesis de 4 informes de research (mcp-mecánica, mcp-en-convex, auth-usuario, tools-interplay). Fecha: 2026-08-21. No es código de producción: es la especificación que Erik aprueba antes de construir.

> **Verificación web (2026-08-21) de las 2 afirmaciones load-bearing:**
> 1. **Convex MCP Gateway EXISTE** y es un componente real (convex.dev/components/convex-mcp-gateway): implementa MCP Streamable-HTTP 2025-06-18, se monta en un `httpAction` con callback `authorize`, audit log, y OAuth bridge opcional. → La arquitectura recomendada (§2) es válida.
> 2. **Clerk SÍ soporta DCR** hoy (CIMD + Dynamic Client Registration, lib `@clerk/mcp-tools`). → **Resuelve la decisión abierta #2**: Clerk puede ser el OAuth authorization server directo; el bridge del Gateway queda en gran parte redundante para OAuth (útil igual para el transporte MCP). Caveat de seguridad: DCR expone un endpoint de registro público, pero Clerk fuerza la pantalla de consentimiento cuando está activo.

---

## 1. Resumen ejecutivo

**Qué es la Fase C.** Un servidor MCP que convierte al "coach" de una sesión local de Claude Code (que hoy edita JSON en `%APPDATA%`) en un coach **remoto**: desde el teléfono, otra máquina, o claude.ai. El coach remoto no toca archivos ni el store; escribe en **Convex**, y el sync de Fase B espeja esos cambios a los archivos locales, donde el watcher los aplica (~2s). "Archivos mandan, Convex espeja" se mantiene intacto.

**Qué desbloquea.**
- Coaching desde cualquier dispositivo sin la app de escritorio abierta (opera sobre el último estado sincronizado; los writes aterrizan cuando el desktop reconecta).
- Reusar el **mismo modelo de permisos ya shipeado** (`requireUserId` en `convex/social.ts`): el `userId` sale del token verificado, nunca de un argumento. Cada usuario solo puede tocar sus propios datos.
- Paridad exacta con el catálogo de acciones que ya usa la UI/el coach local (`buildCoachTools()`): 20 tools hoy (módulo `pausa`); los módulos dormidos (`entreno`) no exponen tools hasta habilitarse.

**La decisión central.** Servir el MCP **dentro de Convex** como `httpAction`, apoyándose en el componente **Convex MCP Gateway**, en vez de correr un servidor Node separado. Colapsa hosting + auth + datos en un solo deploy y reusa la verificación nativa del JWT de Clerk.

**Dependencia dura.** Fase C depende de Fase A (tabla `userDocs` + mapping file-group↦doc) y Fase B (loop de sync que baja el doc al archivo). Un write del MCP no se vuelve "vivo" hasta que el sync lo baja al archivo y el watcher lo aplica.

---

## 2. Arquitectura elegida

### Recomendación: **MCP-en-Convex (`httpAction`), sobre el componente Convex MCP Gateway. Servidor Node separado: descartado.**

**Por qué MCP-en-Convex gana:**

1. **Prior art directo y maduro.** El componente oficial **Convex MCP Gateway** (`convex.dev/components/convex-mcp-gateway`) corre dentro de Convex como `httpAction` montado en el `httpRouter`, e implementa el protocolo **MCP Streamable HTTP (spec 2025-06-18) completo**: sesiones, negociación de `Accept`, validación de `MCP-Protocol-Version`, `tools/list` + `tools/call`, DELETE de sesión atado a identidad. Toda la plomería JSON-RPC que no queremos reescribir viene resuelta.
2. **Auth nativa, cero código.** Usa `ctx.auth.getUserIdentity()` sin cambios en el setup existente, contra el issuer OIDC que ya está declarado en `convex/auth.config.ts` (Clerk `becoming-bison-9194.clerk.accounts.dev`, `applicationID:"convex"`). El `userId` que llega es el mismo Clerk `sub` que `requireUserId` ya usa → **el modelo de permisos se transfiere sin cambios**.
3. **Tools = funciones Convex** (`defineMcpQuery`/`defineMcpMutation`/`defineMcpAction`), co-ubicadas con la DB: mismo `requireUserId`, transaccional, **sin hop de red** entre "capa MCP" y "capa datos".
4. **Scope por-usuario con un callback `authorize`** (modo `list` filtra tools visibles; modo `call` gatea ejecución) + audit log de una fila por llamada.
5. **El OAuth bridge que claude.ai exige.** El Gateway implementa RFC 8414 (AS Metadata), RFC 7591 (Dynamic Client Registration), RFC 9728 (Protected Resource Metadata) y RFC 6750 (`WWW-Authenticate`) **frente a IdPs que no exponen DCR propia**. Esta es la pieza que normalmente rompe las integraciones caseras con claude.ai y la que más cuesta hacer a mano.

**Límites de `httpAction` — ninguno aprieta a un coach request/response:**

| Aspecto | Realidad | ¿Aprieta? |
|---|---|---|
| Auth | `Authorization: Bearer <JWT>` → `ctx.auth.getUserIdentity()` verifica el JWT de Clerk contra el issuer | No, es lo que queremos |
| Duración | máx 10 min por action | No (una tool-call son ms) |
| Tamaño | req/resp máx 20 MB | No (los file-group docs son chicos) |
| Streaming | `httpAction` puede devolver `ReadableStream`; SSE es opcional en la spec | No (el coach es request→response) |
| Runtime | V8 por defecto; `"use node"` disponible si algún tool necesitara libs Node | No (las mutations no necesitan Node) |

**Por qué se descarta el servidor Node separado:**
- Agrega un segundo servicio que correr, asegurar, escalar y monitorear (TLS, secrets, uptime) — justo el ops que el diseño local-first / solo-dev evita.
- **Auth de dos saltos:** el Node server tendría que ser el resource server OAuth frente a claude.ai (PRM/DCR/`WWW-Authenticate` a mano) **y** re-autenticarse contra Convex en nombre del usuario reenviando el JWT vía `ConvexHttpClient.setAuth(token)`. Factible y respeta la regla de oro, pero es más superficie y un lugar más donde un token puede filtrarse.
- Duplica lo que el Gateway regala y agrega latencia.
- **Solo se justificaría** si apareciera un requisito de server-push de larga vida o fanout a backends que no son Convex. Ninguno aplica a la Fase C.

**Nota de vigencia:** fijar en el plan la spec **MCP Streamable HTTP 2025-06-18** (reemplazó a HTTP+SSE 2024-11-05; es la que soportan claude.ai, Claude Code, Cursor y a la que apunta el Gateway). El transporte SSE legacy queda descartado.

---

## 3. Diseño de AUTH scopeada al usuario

### La restricción dura (qué exige Convex)

`social.ts::requireUserId` devuelve `identity.subject` = claim `sub` de un JWT que Convex valida contra `auth.config.ts`. Para resolver **al usuario correcto**, el token que sostenga el MCP DEBE ser un JWT con:
- `iss` = `https://becoming-bison-9194.clerk.accounts.dev`
- `aud` = `"convex"` (el `applicationID` = nombre del JWT template)
- `sub` = el Clerk user id (`user_…`) → esto termina en `identity.subject`
- firmado por Clerk; Convex verifica contra el JWKS del issuer.

Todo el problema se reduce a: **cómo consigue el cliente remoto ese JWT (y lo refresca) sin pegar un secreto Clerk de larga vida ni una admin/deploy key.**

### Opción recomendada: OAuth 2.1 contra Clerk vía el OAuth bridge del Gateway

Para el caso primario — **claude.ai / Claude Desktop / Claude Code**, todos clientes OAuth-nativos — el flujo limpio es que **el propio cliente hace OAuth contra Clerk**; el MCP-en-Convex nunca ve una key, solo el bearer del usuario en cada request.

**Flujo paso a paso (claude.ai):**
1. Erik agrega el connector en claude.ai → Settings → Connectors → "Add custom connector" → pega la URL del MCP (`https://<deployment>.convex.site/mcp`).
2. Primer request sin token → el Gateway responde **401 + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`**.
3. claude.ai descubre el authorization server vía `.well-known/oauth-protected-resource` (RFC 9728), se registra (DCR/RFC 7591 servido por el bridge) y arranca el flujo **OAuth 2.1 + PKCE** contra Clerk.
4. Erik firma en **su propia** cuenta Clerk en el popup del browser → Clerk emite `access_token` (con `aud` = URI canónica del MCP) + `refresh_token`.
5. claude.ai adjunta el bearer en `Authorization` en cada request. El Gateway lo verifica (firma + audiencia + expiración) y `ctx.auth.getUserIdentity()` resuelve el `sub` real.

**Vida / refresh / revocación:**
- Access token corto; refresh lo maneja el cliente OAuth (claude.ai) de forma transparente.
- Revocación central: revocar la autorización/sesión del usuario en el dashboard de Clerk. Identidad = Clerk `sub` real → consistente con `social.ts` y con el mirror file-group↦doc.

**Para dogfooding tuyo (Claude Code / Desktop):** header estático `Authorization: Bearer <JWT-convex del usuario>` vía `claude mcp add --transport http microset <url> --header "Authorization: Bearer ${TOKEN}"` o `.mcp.json`. Ambos caminos (OAuth y header) terminan en el mismo `identity.subject`.

**Refresh del lado que mantiene sesión (si construimos un cliente MCP propio):** usar `ConvexClient` (WebSocket) con `setAuth(fetchToken, onChange)` — `fetchToken` auto-refresca ~60s antes del `exp` y devuelve `null` para señalar revocación. **NO** usar `ConvexHttpClient.setAuth()`, que recibe un JWT estático y no auto-refresca. Subir el lifetime del template "convex" de 60s a 2–5 min para un remoto más charlatán.

### Alternativas — para clientes NO-OAuth (custom MCP / CLI headless), y por qué no son primarias

**Diseño 2 — Ticket handoff (la app emite un ticket de un solo uso).** El desktop, ya logueado, llama a una HTTP action `issueCoachTicket` (autenticada con su JWT-convex → `requireUserId` identifica al usuario). La action, con `CLERK_SECRET_KEY` **en env de Convex** (nunca en un dispositivo, nunca una deploy key), hace `clerkClient.signInTokens.createSignInToken(userId, {expires_in_seconds})` → ticket efímero one-time (~10 min) mostrado como código/deep-link. El cliente remoto lo canjea vía Frontend API `strategy:"ticket"` → crea una **sesión Clerk real** → puede `getToken({template:"convex"})` y refrescar indefinidamente.
- *Cuándo importa:* si construimos un cliente MCP propio o una app companion que no puede hacer OAuth interactivo en browser. Mantiene la identidad 100% en Clerk `sub`; el único secreto de larga vida vive server-side en Convex; el remoto queda con sesión revocable centralmente.
- *Por qué no primaria:* claude.ai ya hace OAuth solo; montar el ticket-handoff es trabajo extra sin beneficio para el target real. Queda como fallback de pairing.

**Diseño 3b — Custom-issuer grant revocable (fallback pragmático fase 1).** Un segundo auth provider en Convex = un issuer propio, con signing key solo en env de Convex. `createCoachGrant()` (autenticada por el JWT-convex del usuario) guarda `{grantId, userId, hashedSecret, revoked}` y devuelve el secreto una sola vez (QR/código). Runtime: el MCP presenta el grant a `mintCoachJwt`, que firma un JWT corto (5 min) con `aud:"convex"`, `sub:<userId del grant>`.
- *Por qué no primaria:* introduce un **camino de identidad paralelo** (custom issuer) — hay que garantizar que `sub` == Clerk `sub` (guardar el Clerk user id como `userId` del grant) o arriesgás split-brain de identidad con `social.ts`/el mirror. Además corrés infra de firma (rotar/proteger la key), y el secreto paste-once ES un bearer de larga vida hasta revocarlo (más débil que una sesión que Clerk expira centralmente). Útil solo si no querés operar `CLERK_SECRET_KEY` todavía.

**Descartado explícitamente:**
- **M2M tokens de Clerk como identidad.** Llevan `sub = mch_xxx` (id de máquina), no impersonan a un usuario, y su `iss/aud` no son los del provider "convex". `requireUserId` resolvería la máquina → escribiría en una cuenta fantasma y rompería el scoping. Por defecto no expiran ni se revocan. Nunca como el token que ve Convex.
- **Cualquier admin/deploy key en el MCP.** Regla de oro: el MCP sostiene un **token DEL USUARIO**, jamás una admin/deploy key.
- **Diseño 3a (desktop vende JWT vivos vía rendezvous):** acopla la disponibilidad del remoto a que el desktop esté encendido y shuttlea bearer tokens vivos.

### Reafirmación del límite de permisos

Toda mutation/query empieza con `requireUserId(ctx)` (patrón de `social.ts`) y **deriva el doc de ese `userId`**. Ningún tool acepta `userId`/`ownerId`/`docId`. El scope se hace cumplir por el token verificado, **nunca por argumento**. En un `httpAction` la identidad llega del JWT del caller; no hay admin key en el camino — la garantía es estructural.

---

## 4. Catálogo de tools del MCP

El catálogo se **genera desde `buildCoachTools()`** (unión de namespaces de módulos habilitados) — no se hardcodea. Hoy: 20 tools (módulo `pausa`), paridad exacta con `COACH_TOOLS`. Los args reusan tal cual los JSON Schema ya definidos en `params` de `src/coach/tools.ts` (`additionalProperties:false`, mismos `required`). Ningún tool recibe `userId`.

Cada tool = una **Convex mutation** que hace read-modify-write de UN `userDoc` (key `(userId=Clerk sub, group)`), reusando reducers puros + el sanitizer del file-group.

### → doc `equipment` (`equipment.json = {owned, custom}`)
| Tool | Args | Mutation Convex | Efecto en el doc |
|---|---|---|---|
| `add_equipment` | `{name}` | `coach.addEquipment` | genera id (server), push a `custom` + auto a `owned` |
| `set_equipment_owned` | `{id, owned}` | `coach.setEquipmentOwned` | agrega/quita `id` de `owned` |

### → doc `exercises` (`exercises.json = {custom: Exercise[]}`)
| Tool | Args | Mutation | Efecto |
|---|---|---|---|
| `add_exercise` | `{name, muscle('pull'\|'push'\|'core'\|'legs'), primary[], secondary?[], equipment?[], measure('reps'\|'hold'), context('desk'\|'space'), defaultReps?}` | `coach.addExercise` | genera id, arma `Exercise` (`axis:[{id:"bw",…,kind:"bodyweight"}]`, `defaultSets`), push a `custom` |

### → doc `routine` (`routine.json = {dayTypes, week, dayKind, dayOverrides}`)
| Tool | Args | Mutation | Efecto |
|---|---|---|---|
| `add_to_routine` | `{dayTypeId, exerciseId, sets?, target?, variantId?}` | `coach.addToRoutine` | push item (dedup por exerciseId) |
| `remove_from_routine` | `{dayTypeId, exerciseId}` | `coach.removeFromRoutine` | filtra el item |
| `set_routine_sets` | `{dayTypeId, exerciseId, sets}` | `coach.setRoutineSets` | edita `sets` |
| `set_routine_target` | `{dayTypeId, exerciseId, target}` | `coach.setRoutineTarget` | edita `target` |
| `set_routine_variant` | `{dayTypeId, exerciseId, variantId}` | `coach.setRoutineVariant` | edita `variantId` |
| `set_routine_order` | `{dayTypeId, exerciseIds[]}` | `coach.setRoutineOrder` | reordena (round-robin rank) |
| `add_day_type` | `{name}` | `coach.addDayType` | genera id, push `{id,name,routine:[]}` |
| `rename_day_type` | `{id, name}` | `coach.renameDayType` | renombra |
| `remove_day_type` | `{id}` | `coach.removeDayType` | **guard ≥1**; reescribe `week` refs al fallback |
| `set_week` | `{index(0..6), slot}` | `coach.setWeek` | `week[index] = dayTypeId \| 'rest'` |
| `set_day_kind` | `{index(0..6), kind('home'\|'office'\|'none')}` | `coach.setDayKind` | `dayKind[index]` |
| `set_day_override` | `{date('YYYY-M-D'), slot?, kind?}` | `coach.setDayOverride` | `dayOverrides[date]` |
| `clear_day_override` | `{date}` | `coach.clearDayOverride` | borra la key |
| `set_intensity` | `{dayTypeId, intensity('deload'\|'normal'\|'push')}` | `coach.setIntensity` | `intensity` del day-type |
| `set_day_schedule` | `{dayTypeId, windowStart?, windowEnd?, minRest?, useGlobal?}` | `coach.setDaySchedule` | window/minRest del day-type (o los limpia) |

### → doc `settings` (`settings.json`) — solo subcampos
| Tool | Args | Mutation | Efecto |
|---|---|---|---|
| `set_settings` | `{workWindowStart?, workWindowEnd?, minRest?}` | `coach.setSettings` | patch **solo** `settings.workWindow` y `settings.minRest`. Nunca toca `theme/panelEnabled/notificationsEnabled/snoozeMinutes/demoMode/modules/streakFreeze/levelsEnabled` aunque compartan doc |

### → doc `profile` (`profile.json = {goals, diet, constraints}`)
| Tool | Args | Mutation | Efecto |
|---|---|---|---|
| `set_profile` | `{goals?, diet?, constraints?}` | `coach.setProfile` | patch parcial |

**Excluidos del MCP** (idéntico a la exclusión del coach directo): `resetAll`, `resetSettings`, tema/acento; **sin write a `coach.json`** (provider config); **sin write a `logs`/`entreno`**.

---

## 5. Lado de lectura (contexto para el coach)

**Recomendación: tool `get_context` como primario + espejo opcional como MCP resource.**

- `buildCoachContext()` (`src/coach/context.ts`) hoy hace `useStore.getState()` arriba y luego usa solo campos planos + funciones puras (`analyzeRoutine`, `effectiveSettings`, `scaleSets`, seed). **Refactor a `buildCoachContext(snapshot)`** que reciba un slice plano → se vuelve **isomórfico**: el desktop lo llama con el store; Convex lo recomputa con los `userDocs` + el seed estático.
- **`get_context` tool** → Convex `query coachContext()` (userId del token) arma el snapshot server-side. Es un **read-model computado** (no el doc crudo); un tool garantiza que siempre se sirve recomputado y fresco, y los agentes drivean tools más confiablemente que resources.
- **Espejo opcional** como resource `microset://context` (claude.ai soporta resources), + resources read-only por doc crudo (`microset://routine`, `…/settings`, `…/profile`, `…/equipment`, `…/exercises`) para inspección.
- **`logs` es SOLO lectura.** `buildCoachContext` deriva `progress` de `logs`. El MCP puede *leer* logs (vía el context) pero **no existe tool ni resource escribible** para logs.

---

## 6. Interplay con "archivos mandan, Convex espeja"

### Flujo de escritura remota
```
[Claude remoto] --tool call: set_intensity{dayTypeId,intensity}-->
[MCP-en-Convex httpAction]  (identidad = TOKEN DEL USUARIO — Clerk JWT template "convex", NUNCA admin/deploy key)
   v
[Convex mutation coach.setIntensity]
   1. userId = requireUserId(ctx)              // identity.subject (Clerk sub) — del token, no de arg
   2. doc  = getUserDoc(userId, "routine")     // el doc del PROPIO usuario
   3. next = reducer.setIntensity(doc, args)   // reducer PURO extraído del store
   4. next = sanitizeRoutine(next, doc)        // MISMO sanitizer de files.ts (aislado)
   5. patch(doc, {data: next, updatedAt: Date.now(), rev: doc.rev+1})   // LWW por doc
   v
[Convex userDocs]  routine doc actualizado
   |  ...sync de Fase B (desktop suscrito / poll)...
   v
[Desktop sync]  detecta rev/updatedAt mayor -> baja el doc
   -> escribe routine.json en %APPDATA%/com.microset.app/   (el ARCHIVO manda)
   v
[Watcher de files.ts]  reconcile()/watchImmediate -> loadIntoStore()
   -> sanitize(readAll())  (segundo pasaje, defensa en profundidad)
   -> useStore.setState(patch) -> replan()      // ~≤2s, sin reiniciar
   v
[App]  el motor reprograma el día solo.
```

**El sentido local que ya existe** (para ver el conflicto): `store action -> files.ts writeAll() (debounced 300ms) -> sync Fase B espeja el archivo -> userDocs`.

**Resolución de conflictos:** config = **LWW por doc** (mayor `updatedAt/rev` gana, a nivel documento). `logs` NO es LWW: **unión de eventos**. Convex serializa mutations por doc → dos tools del MCP sobre `routine` no se pisan; el LWW solo media desktop↔Convex.

### Dependencia de Fases A/B
- **Fase A:** tabla `userDocs {userId, group, data, updatedAt, rev}` + índice `by_user_group`. Hoy `convex/schema.ts` solo tiene la capa social — **`userDocs` no existe todavía**. El mapping group↦doc es exactamente `CONFIG_GROUPS` de `files.ts` (`settings, routine, equipment, exercises, profile, coach, logs, entreno`; `context` es readonly-derivado).
- **Fase B:** el loop local↔Convex que baja el doc al archivo (LWW config / unión logs). **Sin B, los writes del MCP no llegan al watcher.**
- Si el desktop está offline, el coaching remoto opera sobre el **último estado sincronizado**; sus writes aterrizan cuando el desktop reconecta.

---

## 7. Modelo de seguridad e invariantes

**Qué NO debe poder hacer NUNCA el MCP:**

1. **Sostener admin/deploy key.** Solo un JWT de Clerk del usuario (`aud:"convex"`, issuer de `auth.config.ts`). Los writes remotos caen en los MISMOS docs del usuario que el desktop.
2. **Scopear por argumento.** Toda mutation/query arranca con `requireUserId(ctx)` y deriva el doc de ese `userId`. Ningún tool acepta `userId/ownerId/docId`. No puede tocar datos ajenos.
3. **Escribir `logs`.** No existe tool ni mutation que escriba el doc `logs` (append-only, propiedad del motor; sync = unión de eventos). Solo lo lee vía el context.
4. **Tocar el plan del día en vivo / efímero.** El "plan de hoy" y el toast no son file-groups (`files.ts`: "Ephemeral state … intentionally not written") → el MCP no tiene superficie para tocarlos. El motor reprograma solo.
5. **`resetAll`/`resetSettings`/tema/acento** ni write a `coach.json`. Fuera del catálogo.
6. **Romper invariantes de config** (enforced server-side antes de commit): `dayTypes ≥ 1`; `week` y `dayKind` largo 7 con slots válidos; `dayOverrides` con slots válidos; ejercicios custom bien formados; **no inventar `exerciseId`/`dayTypeId`** (deben existir o crearse primero — el sanitizer descarta refs inválidas).
7. **Desbordar el alcance de un doc compartido.** `set_settings` toca solo `workWindow`/`minRest`, jamás `modules/demoMode/notificationsEnabled/…` aunque vivan en el mismo doc.
8. **Prescribir lo contraindicado** (restricciones del `profile`). Regla de contenido sostenida en el system prompt del contrato (`docs/agent/coach.md`), no en datos que vengan por el canal.
9. **Exponer tools de módulos dormidos.** Catálogo = `buildCoachTools()` (unión de módulos habilitados); `entreno` no expone tools hasta habilitarse.
10. **Bulk-delete / acciones destructivas.** Writes = transformaciones acotadas + sanitizadas. "Borrá todo" se niega o deja un day-type por defecto (guard ≥1).

**Validación en TRES capas (defensa en profundidad):**
1. **Schema del tool (MCP):** los `params` JSON Schema (`additionalProperties:false`, `required`) rechazan args mal formados en el borde.
2. **Server-side en la mutation, ANTES de commitear:** correr el sanitizer del file-group sobre el `next` computado + enforcar las invariantes que hoy hace el store (`removeDayType` guard ≥1, reescritura de `week`). Un mal write nunca corrompe el userDoc.
3. **Desktop al bajar:** `loadIntoStore()` ya corre `sanitize(readAll())` — segundo pasaje aun si el doc llegara sucio por otra vía.

**Prompt-injection:** el connector conecta Claude a un server "no verificado por Anthropic". Riesgo bajo (el server es tuyo), pero: no devolver contenido de terceros sin sanear, y mantener el contrato del coach como system prompt del lado cliente, sin confiar en instrucciones que lleguen por datos.

---

## 8. Plan de construcción por pasos

**Bloqueantes previos (otros frentes):**
- **[A]** Definir tabla `userDocs` + índice `by_user_group` en `convex/schema.ts`, con el mapping group↦doc = `CONFIG_GROUPS`.
- **[B]** Loop de sync local↔Convex (LWW config / unión logs) que baja el doc al archivo y deja actuar al watcher.

**Trabajo propio de Fase C (secuenciado):**

1. **Extraer sanitizers a módulo puro isomórfico** (p.ej. `src/store/sanitize.ts`): predicados (`isDayType`, `isExercise`, `isVariant`) + funciones `sanitize` de cada file-group, sin deps de Tauri/DOM. Hoy viven inline en `files.ts` importando `@tauri-apps/*` → no importables por Convex. `files.ts` lo reimporta sin cambio de comportamiento. *(No depende de A/B; se puede empezar ya.)*
2. **Extraer los cuerpos de las acciones del store a reducers puros** sobre la forma config: id-gen `newId()`, `updateRoutine`, guards de `removeDayType`, auto-owned de equipment (`useStore.ts`). Importables por el store y por `convex/`. Sin esto, Fase C reimplementa y desincroniza la lógica. *(No depende de A/B.)*
3. **Refactor `buildCoachContext(snapshot)`** para que sea isomórfico (desktop con store; Convex con userDocs + seed). *(No depende de A/B para el refactor; el `query` sí depende de A.)*
4. **[dep A]** Escribir las mutations `coach.*` (una por tool) + `query coachContext`, todas con `requireUserId`, reusando reducers (paso 2) + sanitizers (paso 1).
5. **[dep A]** Montar el MCP-en-Convex: adoptar el componente **Convex MCP Gateway**, declarar los tools con `defineMcpMutation`/`defineMcpQuery` generados desde `buildCoachTools()`, el callback `authorize` (list/call), y el `query coachContext` como `get_context` (+ resource `microset://context`).
6. **Auth:** verificar/configurar en Clerk que el token de sesión lleve `aud="convex"` y la audiencia canónica del MCP; habilitar el OAuth bridge del Gateway (DCR/PRM). Probar dogfooding con header estático en Claude Code, y el flujo OAuth completo desde claude.ai.
7. **[dep A+B end-to-end]** Prueba de humo del flujo completo: tool remoto → mutation → userDoc → sync → archivo → watcher → replan, verificando LWW y que `logs` no se toca.

**Spikes de de-riesgo (en paralelo, antes de comprometer):**
- Verificar el estado/madurez del componente **Convex MCP Gateway** y su cobertura de la spec 2025-06-18 + el OAuth bridge contra Clerk.
- `@clerk/clerk-js` headless (solo si se construye un cliente MCP propio / se implementa el ticket-handoff): canjear ticket (`setActive`) y sostener sesión + `getToken({template:"convex"})` fuera del browser.

---

## 9. Decisiones abiertas (necesitan input de Erik)

1. **¿Adoptar el componente Convex MCP Gateway, o implementar el `httpAction` MCP a mano?** El plan lo asume adoptado (regala transporte + OAuth bridge). Riesgo: dependencia de un componente de terceros y su vigencia. **Decisión: adoptar + spike de validación, vs. reimplementar la plomería (más control, más código).**
2. **Conflicto factual sobre DCR de Clerk.** Un informe afirma que Clerk ya soporta Dynamic Client Registration + CIMD (beta) y podría ser el OAuth AS directo vía `@clerk/mcp-tools`; otro afirma que Clerk **no** expone DCR y por eso hace falta el OAuth bridge del Gateway. **Hay que verificar con la doc actual de Clerk cuál es cierto hoy** — determina si el bridge es imprescindible o redundante.
3. **¿Operar `CLERK_SECRET_KEY` en env de Convex ahora, o diferirlo?** Necesario para el ticket-handoff (Diseño 2, fallback de pairing). Si preferís no operarlo aún, el fallback es el custom-issuer grant (Diseño 3b), con el costo de un camino de identidad paralelo. Con OAuth-directo contra Clerk (opción primaria), ninguno es estrictamente necesario para claude.ai.
4. **¿Migrar al Clerk↔Convex native integration (2026)?** Activa el token de sesión por defecto con `aud=convex` pre-mapeado → `getToken()` sin template. Solo simplifica el minteo; no cambia la arquitectura ni la elección de diseño. **¿Migrar ahora o mantener el template "convex" actual?**
5. **Audiencia canónica del MCP (RFC 8707).** Definir la URI canónica (p.ej. `https://<deployment>.convex.site/mcp`) y confirmar que Clerk emite tokens con esa `aud`. Afecta la validación de audiencia del Gateway.
6. **Lifetime del JWT template "convex".** Hoy 60s. Subir a 2–5 min para un remoto charlatán (reduce refreshes) vs. mantenerlo corto (menor blast radius si se filtra). **¿Qué valor?**
7. **¿`get_context` como tool, resources crudos, o ambos?** El plan recomienda tool primario + resource espejo. Confirmar si querés exponer también los docs crudos read-only (`microset://routine`, etc.) o solo el context computado.