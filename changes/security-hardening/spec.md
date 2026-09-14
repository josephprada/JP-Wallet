# Feature Specification: Security Hardening

**Feature Branch**: `feat/security-hardening`  
**Created**: 2026-09-14  
**Status**: Draft  
**Change**: security-hardening (Change 10)

**Input**: Remediación v1 de la auditoría `docs/security-audit-2026-09.md` — hallazgos High (H1–H5) + quick wins M5/M6/M9 + HSTS/CSP borrador (M3 inicio).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adjuntos con metadata real y provenance (Priority: P1)

Como usuario autenticado, quiero que el servidor valide el archivo subido (tipo y tamaño reales) y que nadie pueda reclamar el blob de otro, para no almacenar malware ni filtrar storage ajeno.

**Acceptance Scenarios**:

1. **Given** un blob en `_storage` con `contentType`/`size` reales, **When** `attachments.create` (o tax) envía `mimeType`/`size` distintos a la metadata, **Then** la mutation falla y no se crea la fila.
2. **Given** un `storageId` ya referenciado por otro attachment (mismo u otro user), **When** otro `create` intenta reclamarlo, **Then** se rechaza.
3. **Given** un usuario que genera muchas upload URLs sin vincular, **When** supera la cuota o el TTL de huérfanos, **Then** no puede seguir abusando storage (rechazo y/o GC).

---

### User Story 2 - Gateway sin PAT en claro y con rate limit (Priority: P1)

Como operador del sistema, quiero que el gateway de agentes no registre el PAT en claro y limite el ritmo de llamadas, para reducir exfiltración si un token se filtra.

**Acceptance Scenarios**:

1. **Given** un request `POST /agent/v1/rpc` con Bearer válido, **When** se autentica, **Then** las mutations internas reciben hash (o identificador no secreto), **nunca** el plaintext del token.
2. **Given** un PAT que supera N requests/minuto (p.ej. 60), **When** llega el siguiente RPC, **Then** responde `429` / error `rate_limited` sin despachar el tool.
3. **Given** un PAT bajo el límite, **When** llama tools dentro de cuota, **Then** el comportamiento de scopes/audit existente se mantiene.

---

### User Story 3 - Deep links seguros en push (Priority: P1)

Como usuario, quiero que al tocar una notificación solo se abra una ruta interna de la app, no un sitio externo.

**Acceptance Scenarios**:

1. **Given** un payload push con `url: "/budgets"`, **When** el usuario toca o el listener navega, **Then** abre esa ruta in-app.
2. **Given** `url: "https://evil.example"` o `url: "//evil.example"`, **When** SW/`NotificationListener` procesan el evento, **Then** **no** navegan a ese destino (fallback a `/` o ignorar).

---

### User Story 4 - Tokens y secretos más seguros (Priority: P2)

Como desarrollador/ops, quiero pepper obligatorio en prod, caducidad por defecto en PATs nuevos, y `.env` fuera de git.

**Acceptance Scenarios**:

1. **Given** prod sin `API_TOKEN_PEPPER` (o vacío), **When** se intenta autenticar/crear token, **Then** falla de forma explícita (o arranque documentado como inválido) — no hashea con pepper `""`.
2. **Given** `apiTokens.create` sin `expiresAt`, **When** se crea el token, **Then** se asigna expiry por defecto (p.ej. 90 días) salvo override explícito.
3. **Given** un archivo `.env` local, **When** se corre `git status` / `git check-ignore`, **Then** `.env` está ignorado (excepto `.env.example`).

---

### User Story 5 - Inputs acotados (Priority: P2)

Como sistema, quiero límites en notas y nombres de archivo para evitar bloat y nombres peligrosos.

**Acceptance Scenarios**:

1. **Given** `notes` que exceden el máximo (p.ej. 2000 chars), **When** se crea/edita transacción (UI o MCP), **Then** se rechaza la operación.
2. **Given** un `filename` con path/`..`/caracteres de control, **When** se crea el adjunto, **Then** se guarda un basename sanitizado (longitud máxima).

---

### User Story 6 - Headers de seguridad (Priority: P3)

Como operador, quiero HSTS y un borrador CSP en la plantilla Nginx de staging/prod.

**Acceptance Scenarios**:

1. **Given** la plantilla Nginx actualizada desplegada en staging, **When** se inspeccionan response headers, **Then** hay `Strict-Transport-Security` y un `Content-Security-Policy` con `default-src 'self'` + allowlist documentada (Convex, Google, fonts).

---

## Edge Cases

- Upload en progreso cuando corre GC: no borrar blobs más jóvenes que el TTL.  
- Rate limit multi-tool en el mismo minuto: contar por token, no por tool.  
- PATs antiguos sin expiry: siguen válidos hasta revoke/rotate; solo nuevos llevan default.  
- `url` relativo con query (`/credits/xyz?x=1`): permitir si el path es seguro.  

---

## Success Criteria

- SC-001: Metadata mismatch → create attachment falla.  
- SC-002: Reclaim de `storageId` ajeno/duplicado → falla.  
- SC-003: Gateway rate limit → `429` reproducible.  
- SC-004: PAT plaintext ausente en args de mutation / logs de dispatch.  
- SC-005: Deep link externo no abre origen externo.  
- SC-006: Pepper vacío rechazado en prod; expiry default en create.  
- SC-007: `.env` gitignored; `notes`/`filename` limitados.  
- SC-008: Headers HSTS + CSP en plantilla Nginx; build OK.  
