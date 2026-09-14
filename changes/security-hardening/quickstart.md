# Quickstart: security-hardening

**Change**: security-hardening (Change 10)  
**Rama**: `feat/security-hardening`

---

## Prerrequisitos

- Convex deployment con `API_TOKEN_PEPPER` **no vacío** (prod/staging)
- App web + (opcional) MCP apuntando al mismo deployment
- Acceso a plantilla Nginx si se prueban headers en staging

---

## Cómo probar

### 1. Deep links (H5)

1. En DevTools / SW, simular `notificationclick` con `data.url = "https://example.com"`.
2. **Esperado:** no navega fuera; fallback `/` o ignore.
3. Repetir con `url = "/budgets"` → abre presupuestos.

### 2. Rate limit gateway (H4)

```bash
# Con PAT válido, repetir >60 veces en 1 minuto contra:
# POST {CONVEX_SITE}/agent/v1/rpc
# Authorization: Bearer jpw_...
```

**Esperado:** a partir del límite → HTTP `429` / `rate_limited`.

### 3. Adjuntos (H1/H2)

1. Subir blob real (p.ej. PNG).
2. Llamar `create` con `mimeType`/`size` falsos distintos a metadata → **rechazo**.
3. Intentar `create` con el mismo `storageId` ya vinculado → **rechazo**.

### 4. Pepper / expiry (M5)

1. Sin `API_TOKEN_REQUIRE_PEPPER`: pepper vacío sigue funcionando (legacy).
2. Con `API_TOKEN_REQUIRE_PEPPER=1` y pepper vacío → create/auth fallan.
3. Crear PAT sin `expiresAt` → debe tener caducidad ~90 días.

**Importante:** si configuras un pepper nuevo distinto del usado al hashear PATs existentes, hay que revocar y recrear tokens.

### 5. `.env` (M6)

```bash
git check-ignore -v .env
```

**Esperado:** match en `.gitignore`.

### 6. Headers (M3)

Tras deploy staging de Nginx:

```bash
curl -sI https://<staging-host> | findstr /I "strict-transport content-security"
```

---

## Rollback rápido

- Revert commit/merge del change.
- Nginx: restaurar plantilla anterior y reload.
- Rate limit: quitar check en `http.ts` / mutation.
