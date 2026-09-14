# Design: Security Hardening

**Change**: security-hardening  
**Spec**: `changes/security-hardening/spec.md`  
**Rama**: `feat/security-hardening`  
**Auditoría**: `docs/security-audit-2026-09.md`

---

## Enfoque

Endurecer controles existentes (adjuntos, agent gateway, push SW, PATs, Nginx) sin cambiar el modelo de auth Google/Convex ni el protocolo MCP. Preferir patrones ya usados (p.ej. `getMetadata` en avatares).

---

## Decisiones

| # | Pregunta | Decisión | Tradeoff |
|---|----------|----------|----------|
| D-01 | Validar adjuntos | `storage.getMetadata(storageId)` en `create` / `createForTaxItem`; comparar allowlist MIME + max size | Igual que avatares; 1 round-trip storage |
| D-02 | Provenance | Rechazar si `storageId` ya aparece en `attachments` (índice); upload URL sigue auth-only | Sin tabla `pendingUploads` en v1 (KISS); GC opcional |
| D-03 | Cuota / GC | Límite de uploads huérfanos por user + cron interno TTL (p.ej. 24–48h sin fila attachment) | Evita DoS storage |
| D-04 | PAT en gateway | En `http.ts` hashear Bearer → pasar `tokenHash` (o `tokenId` post-lookup) a `authenticateAndDispatch` | Mutations no ven plaintext |
| D-05 | Rate limit | Contador por `tokenId` en tabla Convex (ventana 60s, límite 60); error `rate_limited` → HTTP 429 | Fuente de verdad en Convex, no solo MCP |
| D-06 | Deep links | `isSafeAppPath(url)`: empieza por `/`, no por `//`, sin esquema; fallback `/` | Compartido SW + listener |
| D-07 | Pepper | Prod: `API_TOKEN_PEPPER` non-empty required al hash/verify; documentar en `.env.example` | Rompe deploys mal configurados (deseable) |
| D-08 | Expiry default | Si `expiresAt` omitido en create → `now + 90d` | No migrar tokens existentes |
| D-09 | Notes / filename | `MAX_TRANSACTION_NOTES` (2000); filename basename + max 255 + charset seguro | Validators + gateway |
| D-10 | Nginx | Añadir HSTS; CSP report-friendly / borrador con allowlist Convex + Google OAuth + fonts | Staging primero |

---

## Flujos

### Adjunto create

```
generateUploadUrl (auth) → client PUT blob
→ create({ storageId, mimeType, size, filename, ... })
  → meta = getMetadata(storageId)
  → reject if !meta || meta.contentType ∉ allowlist || meta.size > MAX
  → reject if mimeType/size args ≠ meta (opcional strict) o preferir siempre meta
  → reject if storageId already in attachments
  → insert row with meta.contentType / meta.size / safeFilename
```

### Gateway RPC

```
httpAction Bearer plaintext
  → hash = hashToken(plaintext)  // pepper required
  → authenticateAndDispatch({ tokenHash, body })  // NO plaintext
  → rateLimit.check(tokenId) → else throw rate_limited
  → dispatch tool + audit (sin args secretos del bearer)
```

### Deep link

```
url = data.url
if !isSafeAppPath(url) → url = "/"
navigate / openWindow(origin + url)
```

---

## Schema / datos (previsto)

```ts
// Opcional v1 — rate limit window
agentRateLimits: defineTable({
  tokenId: v.id("apiTokens"),
  windowStart: v.number(), // ms
  count: v.number(),
}).index("by_token", ["tokenId"])

// Opcional — pending uploads si D-02 se amplía
// pendingUploads: { userId, storageId, createdAt }
```

Si el rate limit cabe en memoria de mutation con lectura/escritura atómica por `tokenId`, preferir tabla mínima.

---

## Archivos tocados (previstos)

| Área | Archivos |
|------|----------|
| Adjuntos | `convex/attachments.ts`, posiblemente cron GC en `convex/crons.ts` |
| Gateway | `convex/http.ts`, `convex/agentGateway.ts`, `convex/lib/apiTokenAuth.ts` |
| Tokens | `convex/apiTokens.ts`, `.env.example` |
| Validators | `convex/lib/validators.ts` (+ usos en transactions / gateway) |
| Push / SW | `apps/web/src/sw.ts`, `NotificationListener.tsx`, helper `lib/core` o `lib/push` |
| Git | `.gitignore` |
| Nginx | `changes/web-deploy/templates/nginx/*.conf` |
| Docs | `AGENTS.md`, `SPEC.md`, este change |

---

## Testing

- Unit: `isSafeAppPath`, sanitize filename, notes length  
- Manual / script: RPC loop → 429; create attachment con mime falso  
- Staging: headers `curl -I https://…`  

---

## No hacer (v1)

- Rediseñar OAuth / MFA  
- Rate limit en Redis externo  
- Magic-byte scanning completo de archivos  
- Escape HTML email / push privacy (backlog)  
- Invalidar todos los PATs existentes al desplegar  
