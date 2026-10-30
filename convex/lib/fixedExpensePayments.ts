import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { periodKeyFromTimestamp, periodKeyToMonthRange } from "./period";
import { revertSavingsContributionForTransaction } from "./savingsGoalFixedExpense";

function transactionMatchesFixedExpensePayment(
	transaction: Doc<"transactions">,
	item: Doc<"fixedExpenses">,
	periodStart: number,
	periodEnd: number,
): boolean {
	if (transaction.type !== "expense") return false;
	if (transaction.date < periodStart || transaction.date > periodEnd) return false;
	if (transaction.amount !== item.amount) return false;
	if (transaction.categoryId !== item.categoryId) return false;
	if ((transaction.notes ?? "").trim() !== item.name) return false;
	return true;
}

export async function findMatchingPaymentTransaction(
	ctx: { db: QueryCtx["db"] },
	item: Doc<"fixedExpenses">,
	periodKey: string,
): Promise<Doc<"transactions"> | null> {
	const { start, end } = periodKeyToMonthRange(periodKey);
	const userTransactions = await ctx.db
		.query("transactions")
		.withIndex("by_user", (q) => q.eq("userId", item.userId))
		.collect();

	for (const transaction of userTransactions) {
		if (transaction.sourceFixedExpenseId === item._id) {
			if (transaction.date >= start && transaction.date <= end) {
				return transaction;
			}
		}
	}

	for (const transaction of userTransactions) {
		if (
			transactionMatchesFixedExpensePayment(transaction, item, start, end)
		) {
			return transaction;
		}
	}

	return null;
}

/** Gasto fijo vinculado a crédito: pagado si la cuota que vence ese mes está pagada. */
async function hasPaidLinkedCreditInstallment(
	ctx: { db: QueryCtx["db"] },
	creditId: Id<"credits">,
	periodKey: string,
): Promise<boolean> {
	const payments = await ctx.db
		.query("creditPayments")
		.withIndex("by_credit", (q) => q.eq("creditId", creditId))
		.collect();
	return payments.some(
		(payment) =>
			payment.status === "paid" &&
			periodKeyFromTimestamp(payment.dueDate) === periodKey,
	);
}

export async function hasValidPaymentTransaction(
	ctx: { db: QueryCtx["db"] },
	item: Doc<"fixedExpenses">,
	periodKey: string,
): Promise<boolean> {
	if (item.lastPaidPeriodKey === periodKey) return true;

	if (
		item.linkedCreditId &&
		(await hasPaidLinkedCreditInstallment(ctx, item.linkedCreditId, periodKey))
	) {
		return true;
	}

	if (item.lastPaidTransactionId) {
		const linked = await ctx.db.get(item.lastPaidTransactionId);
		if (linked) {
			const { start, end } = periodKeyToMonthRange(periodKey);
			if (linked.date >= start && linked.date <= end) {
				return true;
			}
		}
	}

	return (await findMatchingPaymentTransaction(ctx, item, periodKey)) !== null;
}

export async function clearFixedExpensePaymentForDeletedTransaction(
	ctx: MutationCtx,
	userId: Id<"users">,
	transaction: Doc<"transactions">,
) {
	let fixedExpenseId: Id<"fixedExpenses"> | null = null;

	if (transaction.sourceFixedExpenseId) {
		fixedExpenseId = transaction.sourceFixedExpenseId;
	}

	if (!fixedExpenseId) {
		const linked = await ctx.db
			.query("fixedExpenses")
			.withIndex("by_paid_transaction", (q) =>
				q.eq("lastPaidTransactionId", transaction._id),
			)
			.first();
		if (linked && linked.userId === userId) {
			fixedExpenseId = linked._id;
		}
	}

	if (!fixedExpenseId && transaction.type === "expense") {
		const periodKey = periodKeyFromTimestamp(transaction.date);
		const userFixed = await ctx.db
			.query("fixedExpenses")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		for (const item of userFixed) {
			if (item.lastPaidPeriodKey !== periodKey) continue;
			if (item.amount !== transaction.amount) continue;
			if (item.categoryId !== transaction.categoryId) continue;
			if ((transaction.notes ?? "").trim() !== item.name) continue;
			fixedExpenseId = item._id;
			break;
		}
	}

	if (!fixedExpenseId) return;

	const item = await ctx.db.get(fixedExpenseId);
	if (!item || item.userId !== userId) return;

	await revertSavingsContributionForTransaction(ctx, userId, transaction._id);

	if (
		item.lastPaidTransactionId &&
		item.lastPaidTransactionId !== transaction._id
	) {
		return;
	}

	await ctx.db.patch(fixedExpenseId, {
		lastPaidPeriodKey: undefined,
		lastPaidTransactionId: undefined,
		updatedAt: Date.now(),
	});
}

export async function reconcileFixedExpensePayment(
	ctx: MutationCtx,
	item: Doc<"fixedExpenses">,
): Promise<boolean> {
	if (!item.lastPaidPeriodKey) return false;

	if (item.lastPaidTransactionId) {
		const linked = await ctx.db.get(item.lastPaidTransactionId);
		if (linked) return false;
	}

	const matching = await findMatchingPaymentTransaction(
		ctx,
		item,
		item.lastPaidPeriodKey,
	);
	const now = Date.now();

	if (matching) {
		await ctx.db.patch(item._id, {
			lastPaidTransactionId: matching._id,
			updatedAt: now,
		});
		if (!matching.sourceFixedExpenseId) {
			await ctx.db.patch(matching._id, {
				sourceFixedExpenseId: item._id,
				updatedAt: now,
			});
		}
		return true;
	}

	if (item.lastPaidTransactionId) {
		await ctx.db.patch(item._id, {
			lastPaidTransactionId: undefined,
			updatedAt: now,
		});
		return true;
	}

	return false;
}
