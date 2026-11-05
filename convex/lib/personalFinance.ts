import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Cuenta aislada del balance y del neto mensual (ingresos/gastos). */
export function isAccountExcludedFromPersonalFinance(
	account: Pick<
		Doc<"accounts">,
		"excludeFromPersonalFinance" | "isCreditEscrow"
	>,
): boolean {
	if (account.excludeFromPersonalFinance === true) return true;
	if (account.excludeFromPersonalFinance === false) return false;
	// Legacy: escrow sin flag explícito sigue fuera del balance personal.
	return account.isCreditEscrow === true;
}

export async function excludedPersonalFinanceAccountIds(
	ctx: { db: QueryCtx["db"] },
	userId: Id<"users">,
): Promise<Set<Id<"accounts">>> {
	const accounts = await ctx.db
		.query("accounts")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();

	return new Set(
		accounts
			.filter((account) => isAccountExcludedFromPersonalFinance(account))
			.map((account) => account._id),
	);
}

/**
 * Marca la cuenta de desembolso como escrow y aplica/quita aislamiento
 * de finanzas personales según el flag del crédito.
 */
export async function syncDisbursementAccountIsolation(
	ctx: MutationCtx,
	disbursementAccountId: Id<"accounts"> | undefined,
	isolate: boolean,
) {
	if (!disbursementAccountId) return;
	await ctx.db.patch(disbursementAccountId, {
		isCreditEscrow: true,
		excludeFromPersonalFinance: isolate,
		updatedAt: Date.now(),
	});
}

/**
 * Whether a transaction should count in personal income/expense summaries
 * and appear in the default movimientos list.
 *
 * - Pagos de cuota: siempre sí (dinero real que sale de la billetera personal).
 * - Movimientos de fondo escrow: no.
 * - Resto: no si la cuenta origen está aislada.
 */
export function countsForPersonalFinance(
	transaction: Doc<"transactions">,
	excludedAccountIds: Set<Id<"accounts">>,
): boolean {
	if (transaction.isCreditInstallmentPayment) {
		return true;
	}
	if (transaction.isCreditFundMovement) {
		return false;
	}
	if (excludedAccountIds.has(transaction.accountId)) {
		return false;
	}
	return true;
}

/**
 * Visibilidad en el historial de movimientos (independiente de los totales):
 * con `includeExcludedAccounts` se listan también los movimientos de cuentas
 * excluidas para poder revisarlos y editarlos. Los movimientos internos del
 * fondo escrow de créditos siguen ocultos.
 */
export function visibleInMovementsHistory(
	transaction: Doc<"transactions">,
	excludedAccountIds: Set<Id<"accounts">>,
	options: { includeExcludedAccounts: boolean },
): boolean {
	if (options.includeExcludedAccounts) {
		return !transaction.isCreditFundMovement;
	}
	return countsForPersonalFinance(transaction, excludedAccountIds);
}

/**
 * Transferencia desde cuenta personal hacia ahorro/meta aislada.
 * Cuenta como gasto del mes (sale del disponible y del neto).
 */
export function transferToIsolatedCountsAsExpense(
	transaction: Doc<"transactions">,
	excludedAccountIds: Set<Id<"accounts">>,
): boolean {
	if (transaction.type !== "transfer" || !transaction.toAccountId) {
		return false;
	}
	if (excludedAccountIds.has(transaction.accountId)) {
		return false;
	}
	return excludedAccountIds.has(transaction.toAccountId);
}

/** Monto que aporta al total de gastos personales del período. */
export function personalFinanceExpenseAmount(
	transaction: Doc<"transactions">,
	excludedAccountIds: Set<Id<"accounts">>,
): number {
	if (
		transaction.type === "expense" &&
		countsForPersonalFinance(transaction, excludedAccountIds)
	) {
		return transaction.amount;
	}
	if (transferToIsolatedCountsAsExpense(transaction, excludedAccountIds)) {
		return transaction.amount;
	}
	return 0;
}
