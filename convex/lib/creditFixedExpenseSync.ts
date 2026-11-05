import type { Doc } from "../_generated/dataModel";
import { periodKeyFromTimestamp } from "./period";

export type InstallmentCandidate = Pick<
	Doc<"creditPayments">,
	"installmentNumber" | "dueDate" | "totalDue" | "status"
>;

function isUnpaid(payment: InstallmentCandidate): boolean {
	return (
		payment.status !== "paid" &&
		payment.status !== "cancelled" &&
		payment.totalDue > 0
	);
}

/**
 * Cuota que corresponde a un período del gasto fijo vinculado:
 * la pendiente que vence ese mes o, si no hay, la pendiente más antigua.
 */
export function pickInstallmentForPeriod<T extends InstallmentCandidate>(
	payments: T[],
	periodKey: string,
): T | null {
	const unpaid = payments
		.filter(isUnpaid)
		.sort((a, b) => a.installmentNumber - b.installmentNumber);

	return (
		unpaid.find((p) => periodKeyFromTimestamp(p.dueDate) === periodKey) ??
		unpaid[0] ??
		null
	);
}

/** Evita retroceder `lastPaidPeriodKey` al pagar una cuota vencida antigua. */
export function shouldAdvancePaidPeriod(
	currentPeriodKey: string | undefined,
	nextPeriodKey: string,
): boolean {
	return !currentPeriodKey || nextPeriodKey >= currentPeriodKey;
}
