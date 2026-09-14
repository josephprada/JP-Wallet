# Tasks: security-hardening (Change 10)

**Rama**: `feat/security-hardening`  
**Spec**: `changes/security-hardening/spec.md`  
**Design**: `changes/security-hardening/design.md`  
**Auditoría**: `docs/security-audit-2026-09.md`

---

## Phase 1 — Higiene quick wins

- [x] T001 `.gitignore`: añadir `.env`, `.env.*` (excepto `!.env.example`)
- [x] T002 Documentar `API_TOKEN_PEPPER` required en prod (`.env.example` + comentario en `apiTokenAuth`)
- [x] T003 Rechazar pepper vacío cuando `API_TOKEN_REQUIRE_PEPPER=1` (compat legacy sin flag)
- [x] T004 `apiTokens.create`: expiry default 90 días si `expiresAt` omitido
- [x] T005 `MAX_TRANSACTION_NOTES` + enforce en validators / mutations / gateway
- [x] T006 Sanitizar `filename` (basename, max length, charset) en `attachments.create*`

## Phase 2 — Deep links seguros

- [x] T007 Helper `isSafeAppPath(url: string): boolean` (path relativo, no `//`, no scheme)
- [x] T008 Aplicar en `apps/web/src/sw.ts` (`push` / `notificationclick`)
- [x] T009 Aplicar en `NotificationListener` (y cualquier `NOTIFICATION_NAV`)

## Phase 3 — Agent gateway

- [x] T010 Hashear Bearer en `convex/http.ts`; pasar solo hash/id a dispatch (sin plaintext)
- [x] T011 Ajustar `authenticateAndDispatch` / `apiTokenAuth` para auth por hash
- [x] T012 Tabla/contador rate limit por `tokenId` (60 req / 60s)
- [x] T013 Mapear `rate_limited` → HTTP 429 en `http.ts`; alinear contrato MCP si aplica

## Phase 4 — Adjuntos / storage

- [x] T014 `create` / `createForTaxItem`: `getMetadata`; validar MIME allowlist + size max desde metadata
- [x] T015 Rechazar `storageId` ya referenciado en `attachments`
- [x] T016 Cuota de uploads pendientes / GC huérfanos (cron interno + TTL)

## Phase 5 — Nginx headers

- [x] T017 Plantilla Nginx: `Strict-Transport-Security`
- [x] T018 Plantilla Nginx: borrador `Content-Security-Policy` (allowlist Convex/Google/fonts); documentar en quickstart

## Phase 6 — Docs / verify

- [x] T019 Actualizar `AGENTS.md` + `SPEC.md` roadmap (Change 10 activo)
- [x] T020 Quickstart: cómo probar rate limit, attachment reject, deep link, pepper
- [x] T021 QA manual SC-001…SC-008 + `bun run build`

---

## Dependencias

```
T001–T006 (higiene) independientes entre sí
T007 → T008 → T009
T010 → T011 → T012 → T013
T014 → T015 → T016
T017 → T018
T019–T021 al final (tras fases 1–5)
```
