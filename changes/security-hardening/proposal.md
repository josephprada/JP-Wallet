# Propuesta: Change 10 — Security Hardening

**Versión**: 1.0.0  
**Estado**: En curso  
**Change**: security-hardening  
**Creado**: 2026-09-14  
**Fuente**: `docs/security-audit-2026-09.md`  
**Rama**: `feat/security-hardening` → `testing` → `main`

---

## Intención

Cerrar los hallazgos **High** y los quick wins de la auditoría estática de JP-WALLET: endurecer adjuntos/storage, gateway de agentes (PAT + rate limit), deep links de push, higiene de secretos/tokens y validación de inputs — sin rediseñar auth ni abrir un pentest.

## Alcance

### Dentro del scope (v1)

- **H1+H2+M1**: validar metadata real de storage; provenance de `storageId`; cuotas / GC de uploads huérfanos  
- **H3**: no pasar PAT plaintext a mutations del gateway  
- **H4**: rate limit en `POST /agent/v1/rpc` (Convex)  
- **H5**: allowlist de URLs en SW + navegación de notificaciones  
- **M5**: `API_TOKEN_PEPPER` obligatorio en prod; expiry default de PATs  
- **M6**: `.env` / `.env.*` en `.gitignore`  
- **M9**: tope de longitud en `notes` + sanitizar `filename` de adjuntos  
- **M3 (inicio)**: HSTS + borrador CSP en plantilla Nginx (validar en staging)  

### Fuera del scope (v1 → backlog)

- M2 push genérico / contenido sensible; M4 escape HTML email; M7 push endpoint takeover; M8 redact audit  
- M10 presets MCP / prompt injection; L1–L5; MFA app-level  
- Pentest dinámico, Dependabot continuo, CSP producción “perfecta” (iteración post-staging)

## Capabilities

### New Capabilities
- `storage-attachment-hardening`: metadata + provenance + cuotas/GC de adjuntos  
- `agent-gateway-rate-limit`: límite por token/usuario en Convex  
- `notification-deep-link-allowlist`: solo paths same-origin relativos  

### Modified Capabilities
- `api-tokens`: pepper obligatorio; expiry por defecto  
- `agent-gateway-auth`: autenticación por hash (sin plaintext en mutations)  
- `input-validation`: límites `notes` / `filename`  

## Approach

1. Copiar patrón de avatares (`getMetadata`) a `attachments.create*`  
2. Rate limit en tabla/contador Convex antes de despachar tools  
3. Hash del Bearer en `httpAction`; mutations reciben solo hash/prefix  
4. Helper `isSafeAppPath(url)` compartido SW + listener  
5. Config/docs: gitignore, pepper, expiry, headers Nginx  

## Riesgos

| Riesgo | Likelihood | Mitigación |
|--------|------------|------------|
| Rate limit demasiado agresivo rompe agentes legítimos | Med | 60 rpm alineado MCP; métrica/ajuste |
| CSP borrador rompe OAuth/fonts en staging | Med | Deploy solo testing primero; allowlist explícita |
| GC de huérfanos borra upload en curso | Low | TTL generoso + solo no referenciados |
| Tokens existentes sin expiry | Low | Expiry solo en **nuevos** creates; no invalidar flota actual |

## Rollback

Revert merge del change. Campos/esquema nuevos opcionales o aditivos. Rate limit se desactiva quitando el check. Headers Nginx se revierten en plantilla + redeploy.

## Success Criteria

- [ ] Adjuntos rechazan MIME/size falsos y `storageId` ya reclamado  
- [ ] Gateway responde `429` al superar cuota; PAT no aparece en args de mutation  
- [ ] Deep link absoluto/`//` no navega fuera de la app  
- [ ] `.env` ignorado por git; pepper documentado como required en prod  
- [ ] `bun run build` OK; checklist QA del change  
