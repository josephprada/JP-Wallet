# Guía para agentes (LLM)

Índice de documentación del monorepo **JP-WALLET / SDD**. Consultar estos archivos antes de implementar o diseñar.

---

## Documentos por propósito

| Documento | Ruta | Cuándo usarlo |
|-----------|------|----------------|
| **Design System (JP-DS)** | [`desing.md`](desing.md) | UI, tokens, temas, **mobile-first / responsive**, componentes, motion, accesibilidad |
| **Especificación del producto** | [`SPEC.md`](SPEC.md) | Dominio, stack, capabilities globales, roadmap de changes |
| **Icono de marca** | [`public/icon.svg`](public/icon.svg) | Color y forma de referencia para marca y UI |
| **Arquitectura de un change** | `changes/<change-id>/design.md` | Decisiones técnicas, flujos de datos, estructura de archivos de ese change |
| **Spec funcional de un change** | `changes/<change-id>/spec.md` | Requisitos, escenarios GIVEN/WHEN/THEN, criterios de éxito |
| **Propuesta de un change** | `changes/<change-id>/proposal.md` | Alcance, riesgos, dependencias del change |

---

## Regla de oro: `desing.md` vs `design.md`

| Archivo | Ámbito |
|---------|--------|
| **`/desing.md`** (raíz) | Design system **visual** transversal — aplica a **todos** los changes y a `packages/jp-ds` |
| **`changes/*/design.md`** | Diseño **técnico/arquitectura** de un change concreto (auth, Convex, routing, etc.) |

No confundir ambos. Para colores, tipografía, glassmorphism, motion o componentes → **`desing.md`**. Para loaders, schema Convex o workspaces → **`changes/<id>/design.md`**.

---

## JP-DS en código

```
apps/web/           # App Vite + React (alias @app/*)
apps/mcp-server/    # Servidor MCP (@jp-wallet/mcp-server)
packages/jp-ds/     # Design system (tokens CSS, componentes, motion)
convex/             # Backend Convex (alias @convex/* desde apps/web)
├── tokens/         # CSS custom properties (color, typography, spacing, dark.css)
├── components/     # Button, Input, IconButton, Avatar, Spinner, Checkbox, Radio
└── src/motion/     # Motion tokens (fuente de verdad TS)
```

La app en `apps/web/` consume JP-DS vía alias `@jp-ds/*` y Convex vía `@convex/_generated/api`.

**Scripts raíz:** `bun dev` · `bun build` · `bun lint` · `bun run mcp:dev` · `bun run test:e2e`

---

## Secciones clave de `desing.md`

| Tema | Sección |
|------|---------|
| Principios (incl. mobile-first) | §2 |
| Colores y tokens | §4 |
| Temas (dark default, light, system) | §5 |
| Tipografía | §6 |
| **Layout responsive / mobile-first** | §7 |
| Glassmorphism | §8 |
| Componentes base | §9 |
| Motion tokens | §10 |
| Accesibilidad / reduced motion | §11, §10.8 |

---

## Change activo: security-hardening 🚧 (Change 10 — 2026-09-14)

Rama: `feat/security-hardening` → `testing` → `main` (cuando se pida).

| Artefacto | Ruta |
|-----------|------|
| Propuesta | `changes/security-hardening/proposal.md` |
| Spec | `changes/security-hardening/spec.md` |
| Diseño | `changes/security-hardening/design.md` |
| Tasks | `changes/security-hardening/tasks.md` |
| Quickstart | `changes/security-hardening/quickstart.md` |
| Auditoría | `docs/security-audit-2026-09.md` |

**Alcance v1:** Adjuntos (metadata + provenance + GC); gateway (hash PAT + rate limit); deep-link allowlist; pepper/expiry; `.env` gitignore; notes/filename; HSTS + CSP borrador Nginx.

**Flujo de ramas:** desarrollar y documentar en **`feat/*` → `testing`**; desplegar a producción (`main`) solo cuando se pida explícitamente.

**Roadmap:** Changes 1–8 en prod. Change 9 (`notifications-polish`) en `feat/*` / testing. Change 10 en curso.

---

## Change reciente: notifications-polish 🚧 (Change 9 — 2026-09-10)

Rama: `feat/notifications-polish` → `testing` → `main`.

| Artefacto | Ruta |
|-----------|------|
| Propuesta | `changes/notifications-polish/proposal.md` |
| Spec | `changes/notifications-polish/spec.md` |
| Diseño | `changes/notifications-polish/design.md` |
| Tasks | `changes/notifications-polish/tasks.md` |
| Quickstart | `changes/notifications-polish/quickstart.md` |

**Alcance v1:** Push solo fuera de foreground; copy + deep links; mora fijo +3/+6; omitir este mes.

---

## Change cerrado: app-polish-fixes ✅ (Change 8 — 2026-08-01)

Rama histórica: `feat/app-polish-fixes` — merge `testing` + `main` (prod).

| Artefacto | Ruta |
|-----------|------|
| Spec | `changes/app-polish-fixes/spec.md` |
| Plan | `changes/app-polish-fixes/plan.md` |
| Diseño | `changes/app-polish-fixes/design.md` |
| Tasks | `changes/app-polish-fixes/tasks.md` |

**Alcance v1:** Proyección disponible − fijos (jerarquía visual); modal/scroll movimientos; autofocus; toasts/push; adjuntos en create; MCP `list_fixed_expenses`; Playwright E2E scaffold.

Prod: `https://wallet.lavalex.co` · MCP: `https://mcp.wallet.lavalex.co`

---

## Change cerrado: mcp-access ✅ (Change 7 — 2026-07-29)

Rama histórica: `feat/mcp-access` — merge `testing` + `main` (prod). Ver `changes/mcp-access/`.

---

## Convenciones para agentes

1. **Idioma:** español en comunicación con el usuario; nombres de código en inglés.
2. **Tokens:** nunca hardcodear hex en componentes; usar `var(--color-*)` de JP-DS.
3. **Tema default:** `dark` (ver `desing.md` §5).
4. **Mobile-first:** diseñar e implementar desde 375 px; escalar a tablet/desktop (`desing.md` §7). Probar 320–1440 px.
5. **Marca:** acento `#07FBA2`, inspiración OpenClaw con identidad *Green Bolt*.
6. **Commits:** solo cuando el usuario lo pida explícitamente.
