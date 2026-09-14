# JP-WALLET — Especificación del Proyecto

**Versión**: 0.7.0 (MCP Access — tokens de agente + gateway MCP)
**Estado**: En Revisión
**Última actualización**: 2026-07-27

---

## 1. Visión General

**Nombre del Proyecto**: JP-WALLET
**Tipo**: Aplicación Web de Finanzas Personales

**Visión Central**: Una aplicación de finanzas personales que combina registro de gastos, gestión de presupuestos y control de cuentas. Los usuarios registran sus transacciones de forma manual y visualizan reportes para entender sus hábitos financieros. Además, pueden conectar **cualquier LLM o agente compatible con MCP** (Claude, Gemini, OpenAI, Cursor, OpenClaw, etc.) para consultar y operar sus finanzas con lenguaje natural, bajo tokens de acceso con permisos explícitos.

**Usuarios Objetivo**: Usuario individual que gestiona sus finanzas personales. A futuro, soporte para grupos compartidos (gastos divididos).

---

## 2. Stack Tecnológico

| Capa | Tecnología | Razón |
|------|-----------|-------|
| **Framework** | Vite + React 19 + TypeScript 6 | Rendimiento, ecosistema, tipado fuerte |
| **Package Manager** | Bun | Velocidad, runtime moderno |
| **Linter/Formatter** | Biome | Herramienta unificada DX |
| **Backend** | Convex (cloud) | Tiempo real, TypeScript end-to-end, serverless |
| **Auth** | Google OAuth 2.0 | Single sign-on, simple, requiere conexión en primer login |
| **Estado UI** | Zustand | Liviano, mínimo boilerplate |
| **Estado Servidor** | TanStack Query | Caching automático, revalidación, optimistas |
| **Ruteo** | React Router v6/v7 | Simple, suficiente para ~10 pantallas |
| **Notificaciones** | Diferido a v2 | Web Push cuando se necesite |
| **Offline** | Diferido a v2 | No crítico en VPS con conexión permanente |
| **Despliegue** | Nginx + Certbot (VPS) + Convex Cloud | SPA estática; backend managed; MCP remoto en el mismo VPS |
| **Agentes (MCP)** | Servidor MCP en monorepo (`apps/mcp-server`) | Interoperable con cualquier cliente MCP; auth por PAT |

---

## 3. Principios de Diseño UX/UI

### 3.1 Enfoque Mobile-First Web
- Diseñado pensando en mobile pero adaptable a desktop
- Navegación tipo bottom navigation en mobile, sidebar en desktop
- Formularios grandes optimizados para teclado táctil

### 3.2 Utilidad Ante Todo
- Cada elemento sirve un propósito funcional
- Acciones rápidas en ≤2 clics
- Jerarquía de información: lo importante es lo más visible

### 3.3 JP-DS (Sistema de Diseño)
- Design tokens en CSS custom properties (colores, tipografía, espaciado)
- Modo oscuro/claro desde el inicio
- Componentes base en `packages/jp-ds`
- Portátil a futuros proyectos
- **Fuente de verdad visual:** [`desing.md`](/desing.md) (raíz del repo)

### 3.4 Pantallas Core

```
├── Login / Registro
│   └── Email + password
├── Dashboard (Home)
│   ├── Resumen de balance total
│   ├── Transacciones recientes
│   └── Acciones rápidas (+ gasto, + ingreso)
├── Transacciones
│   ├── Lista filtrable por fecha, categoría, cuenta
│   ├── Búsqueda
│   └── CRUD completo
├── Cuentas
│   ├── Lista de cuentas (efectivo, banco, crédito)
│   ├── Balance por cuenta
│   └── Transferencias entre cuentas
├── Categorías
│   ├── Lista con iconos y colores
│   ├── Crear/Editar categorías
│   └── Estadísticas por categoría
├── Presupuestos
│   ├── Presupuestos activos con barras de progreso
│   ├── Configuración de alertas
│   └── Crear presupuesto mensual
├── Reportes
│   ├── Resumen mensual (ingresos vs gastos)
│   ├── Desglose por categoría (gráficos)
│   └── Exportar (PDF/CSV)
├── Grupos (Futuro)
│   ├── Lista de grupos
│   └── Gastos compartidos
└── Configuración
    ├── Perfil de usuario
    ├── Preferencias (tema, agrupación, idioma, notificaciones)
    ├── Acceso para agentes / MCP (tokens, scopes, conexión)
    └── Estado de sincronización
```

---

## 4. Funcionalidades Core

### 4.1 Autenticación con Google

| Capacidad | Descripción |
|-----------|-------------|
| Inicio de sesión | Botón "Continuar con Google" → flujo OAuth 2.0 |
| Cuenta nueva | Primer login crea `user` automáticamente con categorías por defecto |
| Cierre de sesión | Limpia sesión local, redirect a landing |
| Re-autenticación | Si expira la sesión, vuelve a pedir Google OAuth |

**Nota**: requiere conexión a internet para autenticar. Sin conexión no se puede iniciar sesión por primera vez.

### 4.2 Gestión de Cuentas

| Capacidad | Descripción |
|-----------|-------------|
| Múltiples cuentas | Efectivo, Banco, Tarjeta de Crédito |
| Balance en tiempo real | Saldo actual por cuenta |
| Transferencias | Movimiento de fondos entre cuentas |

### 4.3 Motor de Transacciones

| Capacidad | Descripción |
|-----------|-------------|
| Registrar ingreso | Monto, fecha, categoría, notas |
| Registrar gasto | Misma metadata |
| Transferencias | Internas entre cuentas |
| Editar/Eliminar | CRUD completo |
| Buscar y filtrar | Por fecha, categoría, cuenta, rango de monto |
| Transacciones recurrentes | Automatizadas via Convex scheduled functions |
| **Adjuntos** | **Imágenes y PDFs por transacción (recibos, facturas, extractos)** |
| **Agrupación temporal** | **Vista por semana, mes, trimestre o semestre (configurable)** |

### 4.4 Sistema de Categorías

| Capacidad | Descripción |
|-----------|-------------|
| Categorías personalizadas | Nombre, icono, color |
| Tipos | Ingreso, Gasto, Transferencia |
| Categorías por defecto | Semilla inicial (ver 4.4.1) |

#### 4.4.1 Categorías por Defecto

**Gastos:**
| Nombre | Icono | Color |
|--------|-------|-------|
| Comida | 🍔 | #FF6B6B |
| Transporte | 🚗 | #4ECDC4 |
| Entretenimiento | 🎬 | #9B59B6 |
| Compras | 🛒 | #F39C12 |
| Salud | 💊 | #E74C3C |
| Hogar | 🏠 | #3498DB |
| Servicios | 📄 | #95A5A6 |
| Otros Gastos | 📦 | #7F8C8D |

**Ingresos:**
| Nombre | Icono | Color |
|--------|-------|-------|
| Salario | 💰 | #27AE60 |
| Freelance | 💻 | #2ECC71 |
| Inversiones | 📈 | #16A085 |
| Otros Ingresos | 💵 | #1ABC9C |

**Transferencias:**
| Nombre | Icono | Color |
|--------|-------|-------|
| Transferencia | 🔄 | #34495E |

### 4.5 Presupuestos y Alertas

| Capacidad | Descripción |
|-----------|-------------|
| Crear presupuesto | Límite mensual por categoría |
| Progreso visual | Barras de progreso |
| Umbrales de alerta | Notificar al 50%, 80%, 100% |
| Exceso de gasto | Alerta en tiempo real |

### 4.6 Panel de Resultados y Gráficos

| Capacidad | Descripción |
|-----------|-------------|
| Resumen mensual | Comparativa ingresos vs gastos |
| Desglose por categoría | Gráficos de torta/barras |
| Tendencia | Comparación mes a mes, trimestre a trimestre |
| Gráficos visuales | Barras, líneas, tortas, áreas, combinados |
| Filtros | Por rango de fechas, categoría, cuenta, período |
| Exportar | PDF y CSV |

### 4.7 Gastos Compartidos (Futuro)

| Capacidad | Descripción |
|-----------|-------------|
| Crear grupos | Invitar miembros |
| Gastos grupales | Registrar quién pagó y quién debe |
| Cálculo de balances | Saldo pendiente por miembro |
| Liquidación | Marcar deudas como saldadas |

### 4.8 Sincronización Cloud

| Capacidad | Descripción |
|-----------|-------------|
| Tiempo real | Convex reactive database |
| Multi-dispositivo | Acceso desde varios dispositivos |
| Backup | Backup automático de datos |

### 4.9 Declaración de Renta (DIAN Colombia)

| Capacidad | Descripción |
|-----------|-------------|
| Perfiles anuales | Una declaración por año gravable |
| Secciones DIAN | Patrimonio, Deudas, Ingresos, Deducciones, Rentas exentas |
| Ingresos | Salarios, cesantías, intereses, dividendos, honorarios, otros |
| Deducciones | Salud, educación, vivienda, dependientes, intereses de vivienda |
| Patrimonio | Bienes inmuebles, vehículos, inversiones, cuentas bancarias |
| **Adjuntos** | **Imágenes y PDFs por rubro (certificaciones, facturas, extractos)** |
| Auto-poblar | Trae datos desde `transactions` y `accounts` cuando aplica |
| Exportar | PDF / CSV / JSON listo para revisión o presentación |

### 4.10 Créditos y Préstamos

| Capacidad | Descripción |
|-----------|-------------|
| Registrar crédito | Nombre, entidad, monto original, tasa de interés, plazo, fecha inicio |
| Calendario de pagos | Generado (cuota fija, capital constante) o **importado del extracto bancario** |
| Tasa de interés | EA, NAMV o MV — según cómo la cotice la entidad |
| Abonos a capital | Pagos extraordinarios que recalculan cuotas futuras (reducir plazo o cuota) |
| Destinos / rubros | Trazabilidad del uso del capital desembolsado (en qué se invierte el préstamo) |
| Fondo aislado (escrow) | Cuenta meta vinculada al crédito; excluida del balance personal |
| Gasto desde fondo | Asistente meta → ahorros → gasto → devolución; movimientos filtrados |
| Seguros y otros cobros | Línea opcional por cuota (SEGT, IVA seguro, etc.) |
| Historial de pagos | Registra cada pago, linkea a `transactions` cuando se paga |
| Saldo pendiente | Balance en tiempo real por crédito |
| Alertas de vencimiento | Notificación X días antes del pago |
| Múltiples créditos | Varios créditos simultáneos (hipotecario, vehículo, personal) |

### 4.11 Ahorros y Metas

| Capacidad | Descripción |
|-----------|-------------|
| Crear meta | Nombre, monto objetivo, fecha límite opcional, icono/color |
| Aportes | Registro manual de cada ahorro hacia la meta |
| Progreso visual | Porcentaje, restante, barra de avance |
| Cuenta vinculada | Referencia opcional al saldo de una cuenta existente |
| Estados | Activa, completada, pausada |
| Múltiples metas | Varias metas simultáneas (emergencia, vacaciones, etc.) |

### 4.12 Configuración y Personalización

| Capacidad | Descripción |
|-----------|-------------|
| Tema | Claro / Oscuro / Sistema |
| Período de agrupación | Vista por defecto: semana, mes, trimestre o semestre |
| Gestión de categorías | Crear, editar, archivar categorías (interfaz dedicada) |
| Idioma | Español (default) |
| Notificaciones | Activar/desactivar alertas y recordatorios |
| Acceso para agentes (MCP) | Crear, listar y revocar tokens de acceso con scopes |
| Exportar datos | Descarga completa (PDF, CSV, JSON) |
| Eliminar cuenta | Borrar cuenta y todos los datos asociados |

### 4.13 Acceso MCP para agentes LLM

| Capacidad | Descripción |
|-----------|-------------|
| Tokens personales (PAT) | Generados en Ajustes; secreto visible una sola vez; solo hash en servidor |
| Scopes | Lectura/escritura por dominio (transacciones, cuentas, presupuestos, créditos, ahorros, renta) + destructivo opt-in |
| MCP remoto | URL pública HTTPS para conectar cualquier cliente MCP compatible |
| MCP local (stdio) | Mismo adaptador usable en clientes de escritorio con el mismo token |
| Consultas en lenguaje natural | Overview, reportes, listados y análisis vía tools/resources |
| Escritura controlada | Crear/editar presupuestos, metas, movimientos, etc. según scopes |
| Auditoría | Registro de operaciones realizadas con cada token |
| Caducidad y revocación | Expiry opcional; revocación inmediata desde Ajustes |

**Arquitectura (Opción D):** tokens y autorización en el backend de producto; adaptador MCP en el monorepo; proceso remoto en el VPS. El LLM externo razona; JP-WALLET aporta datos y acciones. Sin chat embebido en la web en este ciclo.

---

## 5. Modelo de Datos

### 5.1 Formato de Moneda
**COP (Peso Colombiano):** `$ 1.234.567` (puntos como separador de miles)

### 5.2 Schema Convex

Tablas: `users`, `accounts`, `transactions`, `categories`, `budgets`, `splitGroups`, `splitExpenses`, `taxDocuments`, `taxItems`, `taxImages`, `credits`, `creditPayments`, `creditCapitalAbonos`, `creditDestinations`, `savingsGoals`, `savingsContributions`, `attachments`, `userPreferences`, `apiTokens`, `apiAuditLog`

### 5.3 Transacciones Recurrentes

```typescript
interface RecurringConfig {
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
  startDate: timestamp;
  endDate?: timestamp;
  nextTriggerDate: timestamp;
  lastTriggerDate?: timestamp;
  autoCreate: boolean;
}
```

### 5.4 Declaración de Renta

```typescript
interface TaxDocument {
  id: string;
  userId: string;
  taxYear: number; // año gravable (ej: 2025)
  status: "draft" | "review" | "filed";
  totalIncome: number;
  totalDeductions: number;
  totalAssets: number;
  totalLiabilities: number;
  taxableIncome: number;
  taxDue: number;
  createdAt: timestamp;
  filedAt?: timestamp;
}

interface TaxItem {
  id: string;
  documentId: string; // → TaxDocument
  section: "income" | "deductions" | "assets" | "liabilities" | "exempt";
  category: string; // ej: "salarios", "salud_prepagada", "vivienda"
  description: string;
  amount: number;
  imageIds: string[]; // → TaxImage
  notes?: string;
  createdAt: timestamp;
}

interface TaxImage {
  id: string;
  itemId: string; // → TaxItem
  storageId: string; // Convex file storage
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: timestamp;
}
```

### 5.5 Créditos y Préstamos

```typescript
interface Credit {
  id: string;
  userId: string;
  name: string; // ej: "Crédito remodelación vivienda VIS"
  lender: string;
  principal: number;
  rateType: "EA" | "NAMV" | "MV";
  interestRate: number; // valor en % según rateType
  termMonths: number;
  startDate: timestamp;
  paymentDay: number; // día del mes (1-31)
  scheduleMode: "cuota_fija" | "capital_constant" | "manual"; // cómo se genera la tabla
  fixedInstallment?: number; // cuota conocida (modo cuota_fija)
  defaultRecalcOnAbono: "shorten_term" | "lower_installment"; // efecto del abono extraordinario
  targetPayoffDate?: timestamp; // meta aspiracional (ej: pagar en 5 años)
  insuranceMonthly?: number; // seguro/comisión fija mensual opcional
  disbursementAccountId?: string; // → Account (cuenta meta / escrow del desembolso)
  operatingAccountId?: string; // → Account (nómina/ahorros pasarela al gastar)
  outstandingBalance: number;
  status: "active" | "paid_off" | "defaulted";
  notes?: string;
  createdAt: timestamp;
}

interface CreditCapitalAbono {
  id: string;
  creditId: string;
  amount: number;
  paidAt: timestamp;
  recalcEffect: "shorten_term" | "lower_installment";
  transactionId?: string;
  notes?: string;
  createdAt: timestamp;
}

interface CreditPayment {
  id: string;
  creditId: string;
  installmentNumber: number;
  dueDate: timestamp;
  paidDate?: timestamp;
  principal: number;
  interest: number;
  insuranceAmount?: number; // SEGT, IVA seguro, etc.
  otherFees?: number;
  totalDue: number; // VR CUOTA = capital + interés + seguros + otros
  status: "pending" | "paid" | "overdue" | "cancelled"; // cancelled tras abono que recalcula
  transactionId?: string;
  isProjected: boolean; // false si el usuario editó la fila manualmente
}

interface CreditDestination {
  id: string;
  creditId: string;
  name: string; // ej: "Construcción escaleras"
  amount: number;
  spentAt?: timestamp;
  status: "planned" | "in_progress" | "completed";
  transactionIds?: string[]; // → Transaction
  notes?: string;
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

### 5.6 Ahorros y Metas

```typescript
interface SavingsGoal {
  id: string;
  userId: string;
  name: string; // ej: "Fondo de emergencia"
  targetAmount: number;
  currentAmount: number; // suma de aportes (derivado o persistido)
  deadline?: timestamp;
  accountId?: string; // → Account (referencia opcional)
  icon?: string;
  color?: string;
  status: "active" | "completed" | "paused";
  notes?: string;
  createdAt: timestamp;
  updatedAt: timestamp;
}

interface SavingsContribution {
  id: string;
  goalId: string; // → SavingsGoal
  amount: number;
  contributedAt: timestamp;
  transactionId?: string; // → Transaction (opcional)
  notes?: string;
  createdAt: timestamp;
}
```

### 5.7 Adjuntos

```typescript
interface Attachment {
  id: string;
  userId: string;
  entityType: "transaction" | "taxItem" | "creditPayment";
  entityId: string;
  storageId: string; // Convex file storage
  filename: string;
  mimeType: string; // image/jpeg, image/png, application/pdf
  size: number; // bytes
  uploadedAt: timestamp;
}
```

### 5.7 Preferencias de Usuario

```typescript
interface UserPreferences {
  id: string;
  userId: string;
  theme: "light" | "dark" | "system";
  defaultGrouping: "week" | "month" | "quarter" | "semester";
  language: "es" | "en";
  notificationsEnabled: boolean;
  updatedAt: timestamp;
}
```

### 5.8 Acceso para agentes (MCP)

```typescript
interface ApiToken {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;      // visible en UI (p. ej. jpw_ab12…)
  tokenHash: string;        // nunca el secreto en claro
  scopes: string[];         // read/write por dominio + destructive
  expiresAt?: timestamp;
  lastUsedAt?: timestamp;
  revokedAt?: timestamp;
  createdAt: timestamp;
}

interface ApiAuditLog {
  id: string;
  userId: string;
  tokenId: string;
  action: string;
  success: boolean;
  summary?: string;         // args redactados
  createdAt: timestamp;
}
```

---

## 6. Arquitectura de Despliegue

> **Nota (2026-07-03):** En producción real (VPS Hostinger) se usa **Nginx + Certbot**, no Caddy. Ver `changes/web-deploy/`.

```
VPS Hostinger (69.6.234.237)
├── Nginx (reverse proxy, TLS Let's Encrypt)
│   ├── lavalex.co / www        → /var/www/lavalex (sitio existente)
│   ├── jarvis.lavalex.co       → OpenClaw :18789
│   ├── wallet.lavalex.co       → /var/www/jp-wallet (JP-WALLET SPA)
│   └── mcp.wallet.lavalex.co   → MCP server JP-WALLET (proceso local)
├── GitHub Actions              → build + rsync + nginx reload (push main)
└── Convex Cloud prod           → https://cheery-bass-870.convex.cloud
```

---

## 7. Seguridad

| Aspecto | Enfoque |
|---------|---------|
| Identidad | Google OAuth (ID token validado server-side en Convex) |
| Sesión | JWT firmado tras validar token de Google |
| API Tokens (PAT) | Tokens personales para agentes MCP; secreto una sola vez; solo hash en servidor; scopes + expiry + revocación |
| Canal agentes | MCP remoto (HTTPS) + stdio local opcional; nunca `CONVEX_DEPLOY_KEY` como identidad de usuario |
| Auditoría | Log de operaciones autenticadas por PAT |
| Datos en tránsito | HTTPS (Nginx + Certbot) |
| Datos en reposo | Convex maneja encriptación |

### 7.1 Flujo de Auth (Google OAuth)

```
App → Inicio
├── ¿Sesión activa?
│   ├── SÍ → Dashboard
│   └── NO → Pantalla con botón "Continuar con Google"
├── Click Google → popup OAuth de Google
├── Usuario autoriza → Google devuelve ID token
├── Convex action valida token contra Google
├── ¿Usuario nuevo?
│   ├── SÍ → crea `user` + categorías por defecto
│   └── NO → carga perfil existente
└── Sesión persistida → Dashboard
```

---

## 8. Sistema de Diseño (JP-DS)

JP-WALLET incluirá un **sistema de diseño reutilizable (JP-DS)** como paquete separado.

**Documento maestro (visual e interacción):** [`desing.md`](/desing.md) — tokens, temas, componentes, motion, accesibilidad e identidad *Green Bolt*. Consultar siempre antes de implementar o diseñar UI.

### Principios
- **Zero dependencia de lógica de negocio** — componentes UI puros
- **Tokens auto-contenidos** — colores, tipografía, espaciado en una sola fuente
- **Themeable** — modo oscuro/claro desde el inicio
- **Accesible** — WCAG 2.1 AA mínimo

### Estructura
```
packages/jp-ds/
├── tokens/
│   ├── color.css
│   ├── typography.css
│   ├── spacing.css
│   └── dark.css (overrides modo oscuro)
├── components/    # Componentes base UI
└── patterns/      # Patrones compuestos (card, list-item, etc.)
```

---

## 9. Pendientes y Decisiones

- [x] Moneda → **COP (Peso Colombiano)**
- [x] Transacciones recurrentes → **Sí**
- [x] Modo offline → **Diferido a v2**
- [x] Formatos de exportación → **PDF, CSV**
- [x] Integración con IA → **Sí (MCP Access — agentes externos vía PAT)**
- [x] Autenticación biométrica → **No, ahora Google OAuth**
- [x] Despliegue → **VPS Hostinger con Docker Compose + Caddy**
- [x] Voz/STT → **No por ahora**
- [x] Login → **Google OAuth (requiere conexión)**
- [x] Declaración de Renta → **Sí, organizada por secciones DIAN con imágenes y PDFs**
- [x] Créditos y préstamos → **Sí, sección personalizada**
- [x] Adjuntos en transacciones → **Sí, imágenes y PDFs**
- [x] Agrupación temporal configurable → **Sí, semana / mes / trimestre / semestre**
- [x] Panel de configuración → **Sí, centralizado (tema, agrupación, categorías, idioma, notificaciones)**
- [x] Panel de Resultados con gráficas → **Sí, gráficos visuales de ingresos/gastos/categorías**

---

## 10. Próximos Pasos

1. ✅ SPEC v0.6.0 con Google Auth + Declaración de Renta + Créditos + Adjuntos + Configuración + Panel de Resultados
2. ✅ **Change 1: web-foundation** (completado 2026-06-24, en `testing`)
   - Google OAuth popup end-to-end (`@convex-dev/auth`)
   - App shell, ruteo, JP-DS, tema (lógica completa; UI toggle diferida)
3. ✅ **Change 2: web-core** (completado 2026-07-03, en `testing`)
   - CRUD cuentas, categorías y transacciones + transferencias
   - Adjuntos por transacción (imágenes y PDFs)
   - Dashboard real con balance, resumen mensual y recientes
   - UI responsive mobile-first alineada a `webcore.pen`
3b. ✅ **Change 2b: web-deploy** (completado 2026-07-03)
   - Producción en `wallet.lavalex.co` (VPS Nginx + Convex Cloud prod)
   - CI/CD: GitHub Actions al push a `main` (workflow listo; primer run al merge)
4. ✅ **Change 3: web-settings — Configuración completa** (completado 2026-07-04, en `testing` + `main`)
   - Perfil (nombre + avatar), apariencia (modo, presets, reset), preferencias, dashboard por período
   - Polish: modo claro, login brand-lock, logo reforzado, tipografías distintivas
5. ✅ **Change 4: web-budgets-reports — Presupuestos + Reportes + Panel de Resultados** (completado 2026-07-05, en `testing` + prod)
   - Límites por categoría con alertas
   - Gastos fijos con recordatorios
   - Gráficos visuales (barras, tortas, líneas, tendencias) con filtros
   - Export CSV/PDF; notificaciones push + in-app
6. ✅ **Change 5: web-credits — Créditos, Préstamos y Ahorros/Metas** (completado 2026-07-12, merge `testing`)
   - Amortización flexible (cuota fija, capital constante, tabla manual/extracto)
   - **Abonos a capital** con recálculo (acortar plazo o bajar cuota)
   - **Destinos/rubros** del desembolso (trazabilidad del uso del capital)
   - **Fondo aislado**: cuenta escrow vinculada, dashboard sin mezclar nómina
   - Simulador de pago anticipado; metas de ahorro con aportes
7. ✅ **Change 6: web-tax-dian — Declaración de Renta (DIAN)** (completado 2026-07-27, merge `testing` + `main`)
   - Items por sección DIAN (Patrimonio, Deudas, Ingresos, Deducciones, Rentas exentas)
   - Adjuntos (imágenes y PDFs) por rubro
   - Auto-poblar desde transacciones, cuentas y créditos/préstamos
   - Exportación CSV/PDF/JSON; estados draft/review/filed
   - Organizador v1 (sin UVT/Muisca)
8. ✅ **Change 7: mcp-access — Acceso MCP para agentes LLM** (completado 2026-07-29, merge `testing` + `main`)
   - Tokens personales (PAT) desde Ajustes: scopes, caducidad, revocación, auditoría
   - Servidor MCP en monorepo (`apps/mcp-server`): remoto HTTPS + stdio local
   - Tools/resources sobre el dominio financiero (lectura → escritura controlada)
   - Deploy en VPS (`mcp.wallet.lavalex.co`); conexión fácil a Claude / Gemini / OpenAI / Cursor / OpenClaw
   - Arquitectura Opción D (sin repo aparte; sin chat embebido en este ciclo)
9. ✅ **Change 8: app-polish-fixes — Polish UX + notificaciones + MCP fijos** (completado 2026-08-01, merge `testing` + `main`)
   - Proyección “Si pagas fijos pendientes” = disponible − fijos pendientes, **más prominente que el neto**
   - Modal de movimiento desde Home sin navegar; scroll móvil tras eliminar
   - Sin autofocus en monto al editar; adjuntos también al crear
   - Reparar spam de toasts al entrar y entrega push a bandeja del móvil
   - MCP: `list_fixed_expenses` + `pendingTotal`
   - Arnés Playwright (E2E/UI) para los escenarios del change
10. 🚧 **Change 9: notifications-polish — Polish push + mora fijos + omitir mes** (`feat/notifications-polish`)
   - Push OS solo fuera de foreground; copy + deep links
   - Mora gasto fijo +3 / +6 días sin pagar
   - Estado “omitir este mes” (fuera de pendientes y notificaciones)
11. 🚧 **Change 10: security-hardening — Remediación auditoría** (en curso, `feat/security-hardening`)
   - Adjuntos: metadata real, provenance, cuotas/GC
   - Gateway: sin PAT plaintext en mutations + rate limit Convex
   - Deep-link allowlist; pepper/expiry PATs; `.env` gitignore; notes/filename
   - Nginx: HSTS + borrador CSP (staging primero)
   - Fuente: `docs/security-audit-2026-09.md`

> **Roadmap:** Changes 1–8 en prod. Change 9 en feat/testing. Change 10 (`security-hardening`) en curso.

---

*Este spec se refinará a medida que avancemos con los ciclos SDD.*
