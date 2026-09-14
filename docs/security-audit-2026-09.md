# Auditoría de seguridad — JP-WALLET

**Fecha:** 2026-09-14  
**Rama:** `testing` @ `6ae3afd` (sincronizada con `main`)  
**Alcance:** revisión estática del monorepo (auth, Convex, adjuntos, gateway MCP, push, frontend, Nginx, CI).  
**No incluye:** pentest dinámico, fuzzing, ni scan CVE automatizado de lockfile.

## Resumen ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| Critical  | 0        |
| High      | 5        |
| Medium    | 10       |
| Low       | 5        |

Base sólida: ownership consistente, PATs hasheados, scopes MCP, CORS cerrado en gateway, sin `dangerouslySetInnerHTML`. Los riesgos accionables están en **adjuntos**, **rate limit del gateway** y **deep links de push**.

---

## Superficie de ataque

| Entry point | Auth | Riesgo principal |
|-------------|------|------------------|
| SPA `wallet.lavalex.co` | Google OAuth + JWT | XSS / deep links / exposición `VITE_*` |
| Convex Cloud | JWT sesión / PAT `jpw_*` | Mutaciones, storage, push, gateway |
| `POST /agent/v1/rpc` | Bearer PAT | Sin rate limit en Convex (bypass MCP) |
| MCP `mcp.wallet.lavalex.co` | Bearer por request | Proxy + rate limit solo in-process |
| Web Push + Service Worker | VAPID | Navegación ciega por `data.url` |
| GitHub Actions → VPS SSH | Secrets GH | Despliegue web + MCP |

---

## Hallazgos High

### H1 — MIME y size confiados al cliente
- **Área:** Adjuntos · **Evidencia:** `convex/attachments.ts`
- **Riesgo:** Bypass de política de archivos; malware tipado como imagen.
- **Remediación:** En `create` / `createForTaxItem` usar `storage.getMetadata(storageId)` y validar `contentType` + `size` reales (mismo patrón que avatares en `users.ts`).

### H2 — Claim de `storageId` ajeno / huérfano
- **Área:** Adjuntos · **Evidencia:** `attachments.create`
- **Riesgo:** Vincular/borrar blobs de otro usuario si se filtra un `storageId`.
- **Remediación:** Exigir que el `storageId` no exista en otra fila; opcional `pendingUploads` ligado a `userId` al generar URL; GC de huérfanos.

### H3 — PAT plaintext en args de mutation
- **Área:** Agent gateway · **Evidencia:** `convex/http.ts` → `agentGateway`
- **Riesgo:** Exposición de tokens en logs/dashboard Convex.
- **Remediación:** Hashear el PAT en el `httpAction`; nunca pasar plaintext a mutations.

### H4 — Sin rate limit en `/agent/v1/rpc`
- **Área:** Rate limit · **Evidencia:** `convex/http.ts`
- **Riesgo:** Bypass del límite MCP; exfiltración masiva con PAT robado.
- **Remediación:** Contador por `tokenId`/`userId` en Convex (p.ej. 60 rpm) → `429` / `rate_limited`.

### H5 — URL de push/SW sin allowlist
- **Área:** Deep links · **Evidencia:** `apps/web/src/sw.ts`
- **Riesgo:** Open redirect si se compromete VAPID o el payload.
- **Remediación:** Solo paths relativos `^/[^/]`; rechazar absolutas y `//` en SW y `NotificationListener`.

---

## Hallazgos Medium

| ID | Área | Hallazgo | Remediación breve |
|----|------|----------|-------------------|
| M1 | Storage | Uploads huérfanos sin cuota | Cuotas + TTL + job GC |
| M2 | Privacidad | Montos en payloads de push | Título genérico; detalle in-app |
| M3 | Headers | Sin CSP ni HSTS en Nginx | HSTS + CSP estricta + Permissions-Policy |
| M4 | Email | HTML sin escape de nombres | Escape HTML centralizado |
| M5 | Tokens | Pepper opcional + sin expiry default | Forzar `API_TOKEN_PEPPER`; expiry 90d |
| M6 | Secrets | `.env` no está en `.gitignore` | Añadir `.env` / `.env.*` (salvo example) |
| M7 | Push | Takeover de endpoint Web Push | Rechazar si endpoint es de otro user |
| M8 | Audit | Args sensibles en `apiAuditLog` | Redactar campos sensibles |
| M9 | Validators | `notes` sin tope de longitud | MAX 500–2000 chars |
| M10 | MCP | Prompt injection inherente a agentes | Presets mínimos; confirm en writes |

---

## Hallazgos Low

| ID | Área | Hallazgo | Remediación breve |
|----|------|----------|-------------------|
| L1 | MCP | 500 con `err.message` al cliente | Mensaje genérico |
| L2 | CI/CD | `bun-version: latest` + MCP `continue-on-error` | Pin Bun; fallar job |
| L3 | Infra | IP/Client ID en `deploy.config.example` | Placeholders |
| L4 | Auth | `next=` latente sin allowlist | Allowlist o eliminar dead code |
| L5 | Migrations | Backfills públicos scoped al user | `internalMutation` / feature-flag |

---

## Plan de remediación

### Fase 0 — Quick wins (1–3 días)

1. **M6:** Añadir `.env` y `.env.*` a `.gitignore` (excepto `.env.example`). Rotar secretos si ya se commitieron.
2. **H5:** Allowlist de deep links en `sw.ts` y `NotificationListener`.
3. **H3:** Hashear PAT en `httpAction` antes de `authenticateAndDispatch`.
4. **M5:** Forzar `API_TOKEN_PEPPER` en prod; expiry default (p.ej. 90 días).
5. **M9:** Tope de longitud en `notes` + sanitizar basename de adjuntos.

### Fase 1 — Controles críticos (1–2 semanas)

1. **H1+H2+M1:** Validar metadata real de storage + provenance + cuotas/GC.
2. **H4:** Rate limit real en el gateway Convex.
3. **M3 (inicio):** HSTS + borrador CSP en Nginx (validar en staging).

### Fase 2 — Endurecimiento (2–4 semanas)

1. **M2:** Push genérico en lock screen; preferencia “contenido sensible”.
2. **M4:** Escape HTML en emails.
3. **M7:** Rechazar subscribe si endpoint pertenece a otro usuario.
4. **M8:** Redactar `apiAuditLog`.
5. **M3:** CSP estricta en prod.
6. Auditoría/aviso UX en exports CSV/PDF/tax.

### Fase 3 — Madurez (backlog / trimestral)

1. **M10:** Presets MCP mínimos; confirmación humana en writes sensibles.
2. **L1–L5:** mensajes 500 genéricos, pin Bun, placeholders, allowlist `next`, internalizar migraciones.
3. Cadencia: `bun audit` / Dependabot; tabletop de incidente (PAT leak, VAPID leak).
4. Considerar MFA a nivel app (hoy solo Google OAuth).

---

## Controles positivos ya presentes

- Ownership `require*Ownership` + errores genéricos (“not found”)
- PATs `jpw_` CSPRNG; solo hash en DB; max 10; revoke
- Scopes por tool + `confirm` en destructive
- Gateway sin CORS `*`; Bearer obligatorio
- MCP Bearer por request; rate limit local 60 rpm
- Avatares validan `getMetadata` (patrón a copiar en adjuntos)
- `internal*` para crons / email / push
- Sin `dangerouslySetInnerHTML` / `eval` en apps
- `VITE_*` solo públicos; secretos en Convex env
- OAuth popup valida `event.origin`

---

## Siguiente paso recomendado

Change SDD `security-hardening` o PR acotado con **Fase 0 + H1/H2/H4/H5**.
