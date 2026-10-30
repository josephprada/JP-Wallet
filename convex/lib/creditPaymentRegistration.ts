import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireAccountOwnership, requireCreditOwnership } from "./auth";
import { createCreditPaymentCategory } from "./creditCategories";
import { markOverdueStatus } from "./creditDates";
import {
	clearLinkedFixedExpenseForCreditTransaction,
	markLinkedFixedExpensePaidForCreditPayment,
} from "./creditFixedExpense";
import { insertCreditLinkedTransaction } from "./creditTransactions";
import { validatePositiveCopAmount } from "./validators";

export async function registerCreditPayment(
	ctx: MutationCtx,
	userId: Id<"users">,
	params: {
		paymentId: Id<"creditPayments">;
		paidDate: number;
		accountId: Id<"accounts">;
		transactionId: Id<"transactions">;
	},
) {
	const payment = await ctx.db.get(params.paymentId);
	if (!payment) throw new Error("Payment not found");
	const credit = await requireCreditOwnership(ctx, userId, payment.creditId);
	if (payment.status === "paid" || payment.status === "cancelled") {
		throw new Error("Payment already settled");
	}

	await requireAccountOwnership(ctx, userId, params.accountId);

	const transaction = await ctx.db.get(params.transactionId);
	if (!transaction || transaction.userId !== userId) {
		throw new Error("Transaction not found");
	}
	if (transaction.amount !== payment.totalDue) {
		throw new Error("Transaction amount must match installment total");
	}

	const now = Date.now();
	await ctx.db.patch(params.paymentId, {
		status: "paid",
		paidDate: params.paidDate,
		transactionId: params.transactionId,
		updatedAt: now,
	});

	await ctx.db.patch(params.transactionId, {
		creditId: credit._id,
		updatedAt: now,
	});

	const newBalance = Math.max(0, credit.outstandingBalance - payment.principal);
	await ctx.db.patch(credit._id, {
		outstandingBalance: newBalance,
		status: newBalance <= 0 ? "paid_off" : credit.status,
		updatedAt: now,
	});

	await markLinkedFixedExpensePaidForCreditPayment(
		ctx,
		credit,
		payment,
		params.transactionId,
	);
}

export async function createAndRegisterCreditPayment(
	ctx: MutationCtx,
	userId: Id<"users">,
	params: {
		paymentId: Id<"creditPayments">;
		paidDate: number;
		accountId: Id<"accounts">;
		categoryId: Id<"categories">;
		notes?: string;
	},
): Promise<Id<"transactions">> {
	const payment = await ctx.db.get(params.paymentId);
	if (!payment) throw new Error("Payment not found");
	const credit = await requireCreditOwnership(ctx, userId, payment.creditId);
	if (payment.status === "paid" || payment.status === "cancelled") {
		throw new Error("Payment already settled");
	}

	let paymentCategoryId = credit.paymentCategoryId;
	if (!paymentCategoryId) {
		paymentCategoryId = await createCreditPaymentCategory(
			ctx,
			userId,
			credit._id,
			credit.name,
		);
		await ctx.db.patch(credit._id, {
			paymentCategoryId,
			updatedAt: Date.now(),
		});
	}
	if (params.categoryId !== paymentCategoryId) {
		throw new Error("Category does not match credit payment category");
	}

	const amount = validatePositiveCopAmount(payment.totalDue);
	const transactionId = await insertCreditLinkedTransaction(ctx, userId, {
		type: "expense",
		amount,
		date: params.paidDate,
		accountId: params.accountId,
		categoryId: paymentCategoryId,
		creditId: credit._id,
		isCreditInstallmentPayment: true,
		notes:
			params.notes ?? `Cuota #${payment.installmentNumber} — ${credit.name}`,
	});

	await registerCreditPayment(ctx, userId, {
		paymentId: params.paymentId,
		paidDate: params.paidDate,
		accountId: params.accountId,
		transactionId,
	});

	return transactionId;
}

export async function revertCreditPaymentForTransaction(
	ctx: MutationCtx,
	userId: Id<"users">,
	transactionId: Id<"transactions">,
) {
	const transaction = await ctx.db.get(transactionId);
	if (!transaction?.creditId) return;

	const creditId = transaction.creditId;
	if (!creditId) return;

	const payments = await ctx.db
		.query("creditPayments")
		.withIndex("by_credit", (q) => q.eq("creditId", creditId))
		.collect();
	const payment = payments.find(
		(p) => p.transactionId === transactionId && p.status === "paid",
	);
	if (!payment) return;

	const credit = await requireCreditOwnership(ctx, userId, payment.creditId);
	const now = Date.now();
	const status = markOverdueStatus("pending", payment.dueDate, now);

	await ctx.db.patch(payment._id, {
		status,
		paidDate: undefined,
		transactionId: undefined,
		updatedAt: now,
	});

	await ctx.db.patch(credit._id, {
		outstandingBalance: credit.outstandingBalance + payment.principal,
		status: "active",
		updatedAt: now,
	});

	await clearLinkedFixedExpenseForCreditTransaction(ctx, credit, transactionId);
}

export function resolveCreditPaymentAccountId(credit: {
	operatingAccountId?: Id<"accounts">;
	disbursementAccountId?: Id<"accounts">;
}): Id<"accounts"> | undefined {
	return credit.operatingAccountId ?? credit.disbursementAccountId;
}
