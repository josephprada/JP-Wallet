import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	type GetToken,
	type ToolDefinition,
	makeRpcTool,
	registerToolDefs,
} from "./types.js";

/**
 * Tools de solo lectura — fase B.
 * Ver `changes/mcp-access/contracts/mcp-tools.md`.
 */
export function buildReadToolDefs(
	getToken: GetToken,
	siteUrl: string,
): ToolDefinition[] {
	return [
		makeRpcTool({
			name: "get_financial_overview",
			description:
				"Resumen financiero: balances, ingresos/gastos del período y movimientos recientes. Requiere scope read:dashboard.",
			inputShape: {
				period: z
					.enum(["week", "month", "quarter", "semester"])
					.optional()
					.describe(
						"Período a resumir; por defecto la preferencia del usuario o 'month'.",
					),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_transactions",
			description:
				"Lista transacciones con filtros opcionales de rango de fecha, cuenta y categoría. Requiere scope read:transactions.",
			inputShape: {
				from: z.number().optional().describe("Timestamp de inicio (epoch ms)."),
				to: z.number().optional().describe("Timestamp de fin (epoch ms)."),
				accountId: z.string().optional(),
				categoryId: z.string().optional(),
				limit: z
					.number()
					.optional()
					.describe("Máximo de resultados a devolver."),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "get_spending_summary",
			description:
				"Totales y desglose de gasto por categoría en un rango de fechas. Requiere scope read:dashboard o read:transactions.",
			inputShape: {
				from: z.number().describe("Timestamp de inicio (epoch ms)."),
				to: z.number().describe("Timestamp de fin (epoch ms)."),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_accounts",
			description:
				"Lista las cuentas del usuario. Requiere scope read:accounts.",
			inputShape: {
				includeArchived: z
					.boolean()
					.optional()
					.describe("Incluir cuentas archivadas."),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_categories",
			description:
				"Lista las categorías del usuario. Requiere scope read:categories.",
			inputShape: {
				includeArchived: z
					.boolean()
					.optional()
					.describe("Incluir categorías archivadas."),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_budgets",
			description:
				"Lista presupuestos (límites de gasto por categoría, pestaña “Límites del mes”) con gastado/restante. NO incluye gastos fijos ni “Pagos del mes”: para eso usa list_fixed_expenses. Devuelve [] si no hay límites creados para ese mes. Requiere scope read:budgets.",
			inputShape: {
				period: z
					.string()
					.optional()
					.describe(
						"Mes 'YYYY-MM' (ej. '2026-10'). Default: mes actual (America/Bogota).",
					),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_fixed_expenses",
			description:
				"Lista gastos fijos (“Pagos del mes”) de un período y el pendingTotal. Por defecto solo pendientes (misma semántica que el dashboard “Si pagas fijos”); con includePaid=true incluye también los ya pagados (isPaid) y paidTotal. Preferir `period: 'YYYY-MM'` a timestamps: el calendario es America/Bogota (UTC-5). La respuesta incluye periodKeys evaluados para verificar el rango. Requiere scope read:budgets.",
			inputShape: {
				period: z
					.string()
					.optional()
					.describe(
						"Mes 'YYYY-MM' (ej. '2026-10'). Si se envía, ignora periodStart/periodEnd.",
					),
				periodStart: z
					.number()
					.optional()
					.describe(
						"Inicio del período (epoch ms, America/Bogota). Default: mes actual. Verifica el año.",
					),
				periodEnd: z
					.number()
					.optional()
					.describe(
						"Fin del período (epoch ms). Default: mes actual. Rango máx. 366 días; puede abarcar varios meses.",
					),
				includePaid: z
					.boolean()
					.optional()
					.describe(
						"Incluir gastos fijos ya pagados en el período (default false).",
					),
				limit: z
					.number()
					.optional()
					.describe("Máximo de ítems en la lista (no afecta pendingTotal)."),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_credits",
			description: "Lista créditos del usuario. Requiere scope read:credits.",
			inputShape: {
				status: z
					.enum(["active", "all"])
					.optional()
					.describe("Filtrar por estado; por defecto 'active'."),
			},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_savings_goals",
			description:
				"Lista metas de ahorro del usuario. Requiere scope read:savings.",
			inputShape: {},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "list_tax_documents",
			description:
				"Lista documentos de impuestos del usuario. Requiere scope read:tax.",
			inputShape: {},
			getToken,
			siteUrl,
		}),
		makeRpcTool({
			name: "get_tax_document",
			description:
				"Obtiene un documento de impuestos por id, opcionalmente con sus items. Requiere scope read:tax.",
			inputShape: {
				documentId: z.string(),
				includeItems: z.boolean().optional(),
			},
			getToken,
			siteUrl,
		}),
	];
}

export function registerReadTools(
	server: McpServer,
	getToken: GetToken,
	siteUrl: string,
): void {
	registerToolDefs(server, buildReadToolDefs(getToken, siteUrl));
}
