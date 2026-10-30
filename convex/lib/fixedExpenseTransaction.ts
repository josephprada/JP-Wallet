import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAccountOwnership, requireCategoryOwnership } from "./auth";
import { getBalanceDeltas } from "./balance";
import { createAndRegisterCreditPayment } from "./creditPaymentRegistration";
import { pickInstallmentForPeriod } from "./creditFixedExpenseSync";
import { hasValidPaymentTransaction } from "./fixedExpensePayments";
import { appliesToPeriodKey, assertAppliesToPeriodKey } from "./fixedExpensePeriod";
import {
	findSavingsGoalForFixedExpense,
	recordSavingsContributionForFixedExpense,
} from "./savingsGoalFixedExpense";
import { insertSavingsGoalTransferTransaction } from "./savingsGoalTransaction";
import { validatePositiveCopAmount } from "./validators";

export async function registerFixedExpensePayment(
	ctx: MutationCtx,
	userId: Id<"users">,
	params: {
		fixedExpenseId: Id<"fixedExpenses">;
		accountId: Id<"accounts">;
		amount: number;
		date: number;
		periodKey: string;
		categoryId: Id<"categories">;
		notes?: string;
	},
): Promise<Id<"transactions">> {
	const item = await ctx.db.get(params.fixedExpenseId);
	if (!item || item.userId !== userId) {
		throw new Error("Fixed expense not found");
	}
	if (!item.active) {
		throw new Error("Fixed expense is inactive");
	}
	assertAppliesToPeriodKey(item, params.periodKey);
	if (item.categoryId !== params.categoryId) {
		throw new Error("Category does not match the fixed expense");
	}
	if (item.lastPaidPeriodKey === params.periodKey) {
		throw new Error("Already paid for this period");
	}
	if (
		await hasValidPaymentTransaction(ctx, item, params.periodKey)
	) {
		throw new Error("Already paid for this period");
	}

	const account = await requireAccountOwnership(ctx, userId, params.accountId);
	if (account.archived) {
		throw new Error("Account is archived");
	}

	if (item.linkedCreditId) {
		return await payLinkedCreditInstallment(ctx, userId, {
			creditId: item.linkedCreditId,
			accountId: params.accountId,
			date: params.date,
			periodKey: params.periodKey,
			notes: params.notes,
		});
	}

	const category = await requireCategoryOwnership(
		ctx,
		userId,
		item.categoryId,
	);
	if (category.archived || category.type !== "expense") {
		throw new Error("Invalid category for expense");
	}

	const amount = validatePositiveCopAmount(params.amount);
	if (amount !== item.amount) {
		throw new Error(
			`El monto debe coincidir con el gasto fijo (${item.amount.toLocaleString("es-CO")} COP)`,
		);
	}

	const linkedGoal = await findSavingsGoalForFixedExpense(
		ctx,
		userId,
		params.fixedExpenseId,
		item,
	);
	const savingsTransfer =
		linkedGoal?.accountId !== undefined &&
		linkedGoal.accountId !== params.accountId;

	const now = Date.now();
	const transactionNotes = params.notes?.trim() || item.name;
	let transactionId: Id<"transactions">;

	if (savingsTransfer && linkedGoal?.accountId) {
		transactionId = await insertSavingsGoalTransferTransaction(ctx, userId, {
			fromAccountId: params.accountId,
			toAccountId: linkedGoal.accountId,
			amount,
			date: params.date,
			notes: `Aporte meta «${linkedGoal.name}» — gasto fijo «${item.name}»`,
		});
	} else {
		const deltas = getBalanceDeltas({
			type: "expense",
			amount,
			accountId: params.accountId,
		});

		for (const { accountId, delta } of deltas) {
			const acc = await requireAccountOwnership(ctx, userId, accountId);
			if (acc.archived && delta < 0) {
				throw new Error("Cannot debit archived account");
			}
			await ctx.db.patch(accountId, {
				balance: acc.balance + delta,
				updatedAt: now,
			});
		}

		transactionId = await ctx.db.insert("transactions", {
			userId,
			type: "expense",
			amount,
			date: params.date,
			accountId: params.accountId,
			categoryId: item.categoryId,
			notes: transactionNotes,
			sourceFixedExpenseId: params.fixedExpenseId,
			sortOrder: now,
			createdAt: now,
			updatedAt: now,
		});
	}

	await ctx.db.patch(params.fixedExpenseId, {
		lastPaidPeriodKey: params.periodKey,
		lastPaidTransactionId: transactionId,
		updatedAt: now,
	});

	if (linkedGoal) {
		if (!item.linkedSavingsGoalId) {
			await ctx.db.patch(params.fixedExpenseId, {
				linkedSavingsGoalId: linkedGoal._id,
				updatedAt: now,
			});
		}
		await recordSavingsContributionForFixedExpense(ctx, {
			userId,
			goal: linkedGoal,
			amount,
			contributedAt: params.date,
			transactionId,
			fixedExpenseName: item.name,
		});
	}

	if (!savingsTransfer) {
		await ctx.scheduler.runAfter(
			0,
			internal.budgets.checkThresholdAfterTransaction,
			{
				userId,
				categoryId: item.categoryId,
				date: params.date,
			},
		);
	}

	return transactionId;
}

/**
 * Gasto fijo vinculado a un crédito: el pago se registra como pago de la cuota
 * (marca la cuota, baja el saldo del crédito y, vía registerCreditPayment,
 * marca este gasto fijo como pagado). El monto es el de la cuota real.
 */
async function payLinkedCreditInstallment(
	ctx: MutationCtx,
	userId: Id<"users">,
	params: {
		creditId: Id<"credits">;
		accountId: Id<"accounts">;
		date: number;
		periodKey: string;
		notes?: string;
	},
): Promise<Id<"transactions">> {
	const credit = await ctx.db.get(params.creditId);
	if (!credit || credit.userId !== userId) {
		throw new Error("Credit not found");
	}
	if (!credit.paymentCategoryId) {
		throw new Error("Credit has no payment category");
	}

	const payments = await ctx.db
		.query("creditPayments")
		.withIndex("by_credit", (q) => q.eq("creditId", params.creditId))
		.collect();
	const installment = pickInstallmentForPeriod(payments, params.periodKey);
	if (!installment) {
		throw new Error(
			"No hay cuotas pendientes en el calendario del crédito para registrar este pago",
		);
	}

	return await createAndRegisterCreditPayment(ctx, userId, {
		paymentId: installment._id,
		paidDate: params.date,
		accountId: params.accountId,
		categoryId: credit.paymentCategoryId,
		notes: `Cuota #${installment.installmentNumber} — ${credit.name}`,
	});
}

export async function listUnpaidFixedExpensesForCategory(
	ctx: { db: QueryCtx["db"] },
	userId: Id<"users">,
	categoryId: Id<"categories">,
	periodKey: string,
): Promise<
	Array<{
		_id: Id<"fixedExpenses">;
		name: string;
		amount: number;
		dayOfMonth: number;
		linkedSavingsGoalName?: string;
	}>
> {
	const items = await ctx.db
		.query("fixedExpenses")
		.withIndex("by_user_active", (q) =>
			q.eq("userId", userId).eq("active", true),
		)
		.collect();

	const unpaid = [];
	for (const item of items) {
		if (item.categoryId !== categoryId) continue;
		if (!appliesToPeriodKey(item, periodKey)) continue;
		if (item.skippedPeriodKey === periodKey) continue;
		if (await hasValidPaymentTransaction(ctx, item, periodKey)) continue;

		let linkedSavingsGoalName: string | undefined;
		const linkedGoal = await findSavingsGoalForFixedExpense(
			ctx,
			userId,
			item._id,
			item,
		);
		if (linkedGoal) {
			linkedSavingsGoalName = linkedGoal.name;
		}

		unpaid.push({
			_id: item._id,
			name: item.name,
			amount: item.amount,
			dayOfMonth: item.dayOfMonth,
			linkedSavingsGoalName,
		});
	}

	return unpaid.sort((a, b) => a.dayOfMonth - b.dayOfMonth);
}
