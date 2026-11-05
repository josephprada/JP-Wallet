import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCreditOwnership, requireUserId } from "./lib/auth";
import { markOverdueStatus } from "./lib/creditDates";
import { clearLinkedFixedExpenseForCreditTransaction } from "./lib/creditFixedExpense";
import {
	createAndRegisterCreditPayment,
} from "./lib/creditPaymentRegistration";
import { removeCreditLinkedTransaction } from "./lib/creditTransactions";

export const listByCredit = query({
	args: { creditId: v.id("credits") },
	handler: async (ctx, { creditId }) => {
		const userId = await requireUserId(ctx);
		await requireCreditOwnership(ctx, userId, creditId);
		const now = Date.now();
		const payments = await ctx.db
			.query("creditPayments")
			.withIndex("by_credit", (q) => q.eq("creditId", creditId))
			.collect();
		const activePayments = payments.filter((p) => p.status !== "cancelled");
		return activePayments
			.map((p) => ({
				...p,
				status: markOverdueStatus(p.status, p.dueDate, now),
			}))
			.sort((a, b) => a.installmentNumber - b.installmentNumber);
	},
});

export const markPaid = mutation({
	args: {
		paymentId: v.id("creditPayments"),
		paidDate: v.optional(v.number()),
		accountId: v.optional(v.id("accounts")),
	},
	handler: async (ctx, { paymentId, paidDate, accountId }) => {
		const userId = await requireUserId(ctx);
		const payment = await ctx.db.get(paymentId);
		if (!payment) throw new Error("Payment not found");
		const credit = await requireCreditOwnership(ctx, userId, payment.creditId);

		const payAccountId =
			accountId ??
			credit.operatingAccountId ??
			credit.disbursementAccountId;
		if (!payAccountId) {
			throw new Error("Credit has no payment account configured");
		}
		if (!credit.paymentCategoryId) {
			throw new Error("Credit has no payment category");
		}

		await createAndRegisterCreditPayment(ctx, userId, {
			paymentId,
			paidDate: paidDate ?? Date.now(),
			accountId: payAccountId,
			categoryId: credit.paymentCategoryId,
		});

		return null;
	},
});

export const markUnpaid = mutation({
	args: { paymentId: v.id("creditPayments") },
	handler: async (ctx, { paymentId }) => {
		const userId = await requireUserId(ctx);
		const payment = await ctx.db.get(paymentId);
		if (!payment) throw new Error("Payment not found");
		const credit = await requireCreditOwnership(ctx, userId, payment.creditId);
		if (payment.status !== "paid") {
			throw new Error("Payment is not marked as paid");
		}

		if (payment.transactionId) {
			await clearLinkedFixedExpenseForCreditTransaction(
				ctx,
				credit,
				payment.transactionId,
			);
			await removeCreditLinkedTransaction(ctx, userId, payment.transactionId);
		}

		const now = Date.now();
		const status = markOverdueStatus("pending", payment.dueDate, now);

		await ctx.db.patch(paymentId, {
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

		return null;
	},
});

