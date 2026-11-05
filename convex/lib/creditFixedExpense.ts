import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { pickInstallmentForPeriod, shouldAdvancePaidPeriod } from "./creditFixedExpenseSync";
import { periodKeyFromTimestamp } from "./period";
import { validateDayOfMonth, validatePositiveCopAmount } from "./validators";

export async function resolveCreditInstallmentAmount(
	ctx: MutationCtx,
	creditId: Id<"credits">,
	credit: Pick<Doc<"credits">, "fixedInstallment" | "scheduleMode">,
): Promise<number> {
	if (credit.fixedInstallment && credit.fixedInstallment > 0) {
		return credit.fixedInstallment;
	}

	const payments = await ctx.db
		.query("creditPayments")
		.withIndex("by_credit", (q) => q.eq("creditId", creditId))
		.collect();

	const nextPayment = payments
		.filter(
			(payment) =>
				payment.status !== "cancelled" &&
				payment.status !== "paid" &&
				payment.totalDue > 0,
		)
		.sort((a, b) => a.installmentNumber - b.installmentNumber)[0];

	if (nextPayment) {
		return nextPayment.totalDue;
	}

	throw new Error(
		"No se pudo determinar el valor de la cuota para el gasto fijo. Ingresa el valor de la cuota o completa el calendario.",
	);
}

export async function createLinkedCreditFixedExpense(
	ctx: MutationCtx,
	userId: Id<"users">,
	creditId: Id<"credits">,
	credit: Doc<"credits">,
	paymentCategoryId: Id<"categories">,
	installmentAmount: number,
): Promise<Id<"fixedExpenses">> {
	const now = Date.now();
	const amount = validatePositiveCopAmount(installmentAmount);
	const dayOfMonth = validateDayOfMonth(credit.paymentDay);

	const fixedExpenseId = await ctx.db.insert("fixedExpenses", {
		userId,
		name: credit.name,
		amount,
		categoryId: paymentCategoryId,
		dayOfMonth,
		reminderOffsets: credit.reminderOffsets,
		emailReminders: false,
		pushReminders: true,
		active: true,
		linkedCreditId: creditId,
		notes: `Gasto fijo vinculado al crédito «${credit.name}»`,
		createdAt: now,
		updatedAt: now,
	});

	await ctx.db.patch(creditId, {
		linkedFixedExpenseId: fixedExpenseId,
		updatedAt: now,
	});

	return fixedExpenseId;
}

export async function syncLinkedCreditFixedExpense(
	ctx: MutationCtx,
	creditId: Id<"credits">,
	credit: Doc<"credits">,
): Promise<void> {
	if (!credit.linkedFixedExpenseId) return;

	const fixedExpense = await ctx.db.get(credit.linkedFixedExpenseId);
	if (!fixedExpense) return;

	let amount: number;
	try {
		amount = await resolveCreditInstallmentAmount(ctx, creditId, credit);
	} catch {
		return;
	}

	await ctx.db.patch(credit.linkedFixedExpenseId, {
		name: credit.name,
		amount,
		dayOfMonth: validateDayOfMonth(credit.paymentDay),
		updatedAt: Date.now(),
	});
}

export async function deleteLinkedCreditFixedExpense(
	ctx: MutationCtx,
	credit: Pick<Doc<"credits">, "linkedFixedExpenseId">,
): Promise<void> {
	if (!credit.linkedFixedExpenseId) return;
	const fixedExpense = await ctx.db.get(credit.linkedFixedExpenseId);
	if (fixedExpense) {
		await ctx.db.delete(credit.linkedFixedExpenseId);
	}
}

/** Monto del gasto fijo = valor real (totalDue) de la próxima cuota pendiente. */
async function syncLinkedFixedExpenseAmountFromSchedule(
	ctx: MutationCtx,
	credit: Pick<Doc<"credits">, "_id" | "linkedFixedExpenseId">,
): Promise<void> {
	if (!credit.linkedFixedExpenseId) return;
	const fixedExpense = await ctx.db.get(credit.linkedFixedExpenseId);
	if (!fixedExpense) return;

	const payments = await ctx.db
		.query("creditPayments")
		.withIndex("by_credit", (q) => q.eq("creditId", credit._id))
		.collect();
	const next = pickInstallmentForPeriod(
		payments,
		periodKeyFromTimestamp(Date.now()),
	);
	if (!next || next.totalDue === fixedExpense.amount) return;

	await ctx.db.patch(fixedExpense._id, {
		amount: next.totalDue,
		updatedAt: Date.now(),
	});
}

/**
 * Al pagar una cuota (desde el panel del crédito, el formulario de movimientos
 * o la card del gasto fijo) marca el gasto fijo vinculado como pagado en el
 * mes de vencimiento de esa cuota.
 */
export async function markLinkedFixedExpensePaidForCreditPayment(
	ctx: MutationCtx,
	credit: Pick<Doc<"credits">, "_id" | "linkedFixedExpenseId">,
	payment: Pick<Doc<"creditPayments">, "dueDate">,
	transactionId: Id<"transactions">,
): Promise<void> {
	if (!credit.linkedFixedExpenseId) return;
	const fixedExpense = await ctx.db.get(credit.linkedFixedExpenseId);
	if (!fixedExpense) return;

	const now = Date.now();
	await ctx.db.patch(transactionId, {
		sourceFixedExpenseId: fixedExpense._id,
		updatedAt: now,
	});

	const periodKey = periodKeyFromTimestamp(payment.dueDate);
	if (shouldAdvancePaidPeriod(fixedExpense.lastPaidPeriodKey, periodKey)) {
		await ctx.db.patch(fixedExpense._id, {
			lastPaidPeriodKey: periodKey,
			lastPaidTransactionId: transactionId,
			updatedAt: now,
		});
	}

	await syncLinkedFixedExpenseAmountFromSchedule(ctx, credit);
}

/** Revierte el estado "pagado" del gasto fijo cuando se deshace el pago de la cuota. */
export async function clearLinkedFixedExpenseForCreditTransaction(
	ctx: MutationCtx,
	credit: Pick<Doc<"credits">, "_id" | "linkedFixedExpenseId">,
	transactionId: Id<"transactions">,
): Promise<void> {
	if (!credit.linkedFixedExpenseId) return;
	const fixedExpense = await ctx.db.get(credit.linkedFixedExpenseId);
	if (!fixedExpense) return;

	if (fixedExpense.lastPaidTransactionId === transactionId) {
		await ctx.db.patch(fixedExpense._id, {
			lastPaidPeriodKey: undefined,
			lastPaidTransactionId: undefined,
			updatedAt: Date.now(),
		});
	}

	await syncLinkedFixedExpenseAmountFromSchedule(ctx, credit);
}
