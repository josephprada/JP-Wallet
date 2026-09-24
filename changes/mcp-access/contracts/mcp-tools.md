# Contract: MCP Tools & Resources

**Change**: mcp-access  
**Implementación**: `apps/mcp-server` + dispatch en `agentGateway`  
**Fases**: B = read, C = write/destructive

Todos los tools pasan por `POST /agent/v1/rpc`. Tipos de args en JSON Schema / Zod en el servidor MCP.

---

## Resources (fase B)

| URI | Scope | Descripción |
|-----|-------|-------------|
| `jpwallet://overview` | `read:dashboard` | Snapshot balances + resumen período actual |
| `jpwallet://budgets/active` | `read:budgets` | Presupuestos activos + progreso |
| `jpwallet://credits/active` | `read:credits` | Créditos activos + saldos |

---

## Tools — Lectura (fase B)

### `get_financial_overview`

- **Scopes**: `read:dashboard`
- **Args**: `{ period?: "week" | "month" | "quarter" | "semester" }` (default preferencia usuario o `month`)
- **Returns**: mirror de `dashboard.overview` (balances, ingresos/gastos período, recientes resumidos)

### `list_transactions`

- **Scopes**: `read:transactions`
- **Args**: `{ from?: number; to?: number; accountId?: string; categoryId?: string; limit?: number }`
- **Returns**: lista resumida (id, date, amount, type, category, account, notes)

### `get_spending_summary`

- **Scopes**: `read:dashboard` **o** `read:transactions`
- **Args**: `{ from: number; to: number }`
- **Returns**: totales + breakdown por categoría (vía `reports.summary` o equivalente)

### `list_accounts` / `list_categories`

- **Scopes**: `read:accounts` / `read:categories`
- **Args**: `{ includeArchived?: boolean }`

### `list_budgets`

- **Scopes**: `read:budgets`
- **Args**: `{ period?: string }` (ej. `'2026-08'`; alias gateway: `periodKey`)
- **Nota**: solo presupuestos/límites por categoría (“Límites del mes”). **No** incluye gastos fijos (“Pagos del mes”) → usar `list_fixed_expenses`. `[]` si no hay límites en ese mes.

### `list_fixed_expenses`

- **Scopes**: `read:budgets`
- **Args**: `{ period?: string; periodStart?: number; periodEnd?: number; includePaid?: boolean; limit?: number }`
  - `period` (`'YYYY-MM'`, alias `periodKey`) tiene prioridad sobre los timestamps; se resuelve al mes calendario America/Bogota (UTC-5). **Recomendado** para agentes.
  - `periodStart`/`periodEnd` en epoch ms; el rango puede abarcar varios meses (máx. 366 días) y se evalúa **cada** mes tocado.
  - `includePaid=true` añade los ya pagados (`isPaid: true`) y `paidTotal`. Default: solo pendientes.
- **Returns**: `{ periodStart, periodEnd, periodKeys, pendingTotal, paidTotal?, items }`; cada item incluye `periodKey`, `dueDate`, `isOverdue`, `isPaid`. Sin `includePaid`, misma semántica que el dashboard “Si pagas fijos”.
- **Diagnóstico**: si `items` viene vacío, revisar `periodKeys` en la respuesta (p. ej. `2024-09` indica timestamps con año equivocado).

### `list_credits`

- **Scopes**: `read:credits`
- **Args**: `{ status?: "active" | "all" }`

### `list_savings_goals`

- **Scopes**: `read:savings`
- **Args**: `{}`

### `list_tax_documents`

- **Scopes**: `read:tax`
- **Args**: `{}`

### `get_tax_document`

- **Scopes**: `read:tax`
- **Args**: `{ documentId: string; includeItems?: boolean }`

---

## Tools — Escritura (fase C)

### `create_transaction`

- **Scopes**: `write:transactions`
- **Args**: campos obligatorios alineados a `transactions.create` (type, amount, accountId, categoryId, date, notes?)
- **Validation**: amount COP entero > 0

### `update_transaction`

- **Scopes**: `write:transactions`
- **Args**: `{ transactionId: string; …patch }`

### `upsert_budget`

- **Scopes**: `write:budgets`
- **Args (MCP público)**: `{ categoryId: string; limit: number; period: string; budgetId?: string }`
  - Crear: `categoryId` + `limit` + `period` (ej. `'2026-08'`)
  - Actualizar: `budgetId` + `categoryId` + `limit` (`period` no se usa)
- **Gateway**: acepta también aliases internos `categoryIds[]` / `amount` / `periodKey` / `id`. El singular `categoryId` se envuelve a `categoryIds: [categoryId]`.

### `create_savings_goal`

- **Scopes**: `write:savings`
- **Args**: `{ name: string; targetAmount: number; targetDate?: number }`
- **Gateway**: `targetDate` → campo `deadline`

### `contribute_to_goal`

- **Scopes**: `write:savings`
- **Args**: `{ goalId: string; amount: number; fromAccountId?: string; contributedAt?: number; notes?: string }`
- **Gateway**: `contributedAt` default `Date.now()`; `fromAccountId` requerido si la meta tiene cuenta vinculada

### `create_tax_item`

- **Scopes**: `write:tax`
- **Args**: `{ documentId; section; category; description; amount; notes? }`
- **Gateway**: también acepta `concept` como alias de `description`
- **Conflict**: document `filed` → `conflict`

### `update_tax_item`

- **Scopes**: `write:tax`
- **Args**: `{ itemId; section?; category?; description?; amount?; notes? }`
- **Gateway**: `concept` alias de `description`
- **Conflict**: document `filed` → `conflict`

---

## Tools — Destructivo (fase C)

### `delete_transaction`

- **Scopes**: `write:transactions` + `destructive`
- **Args**: `{ transactionId: string; confirm: true }`
- Sin `confirm: true` → `confirmation_required`

### `archive_account` / `archive_category` / `remove_budget` / …

Misma regla: scope write del dominio + `destructive` + `confirm: true`.

---

## Prompts (fase D, opcional)

| Name | Uso |
|------|-----|
| `monthly_review` | Guía al LLM a llamar overview + spending_summary |
| `savings_plan` | Guía a leer ingresos/gastos/metas y proponer aporte |

Los prompts **no** mutan solos; instruyen al modelo a usar tools.

---

## Error mapping MCP

El adaptador MCP convierte `error.code` del gateway en `isError: true` + texto para el modelo, sin exponer stack traces.
