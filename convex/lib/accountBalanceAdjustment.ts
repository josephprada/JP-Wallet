import type { Doc } from "../_generated/dataModel";

/**
 * Ajuste de emergencia del saldo: mueve `initialBalance` en el mismo delta
 * para mantener `balance = initialBalance + Σ movimientos` sin crear
 * transacciones que alteren ingresos/gastos.
 */
export function computeBalanceAdjustment(
	account: Pick<Doc<"accounts">, "balance" | "initialBalance">,
	newBalance: number,
): { balance: number; initialBalance: number; delta: number } {
	const delta = newBalance - account.balance;
	return {
		balance: newBalance,
		initialBalance: account.initialBalance + delta,
		delta,
	};
}
