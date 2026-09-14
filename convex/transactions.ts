import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	requireAccountOwnership,
	requireCategoryOwnership,
	requireTransactionOwnership,
	requireUserId,
} from "./lib/auth";
import {
	type TransactionLike,
	getBalanceDeltas,
	invertDeltas,
} from "./lib/balance";
import { executeSpendFromFund } from "./lib/creditFundSpend";
import {
	createAndRegisterCreditPayment,
	revertCreditPaymentForTransaction,
} from "./lib/creditPaymentRegistration";
import { clearFixedExpensePaymentForDeletedTransaction } from "./lib/fixedExpensePayments";
import { registerFixedExpensePayment } from "./lib/fixedExpenseTransaction";
import { periodKeyFromTimestamp } from "./lib/period";
import {
	countsForPersonalFinance,
	excludedPersonalFinanceAccountIds,
} from "./lib/personalFinance";
import { revertSavingsContributionForTransaction } from "./lib/savingsGoalFixedExpense";
import { compareTransactions } from "./lib/transactions";
import {
	transactionTypeValidator,
	validatePositiveCopAmount,
	validateTransactionNotes,
} from "./lib/validators";

const MAX_RECENT_LIMIT = 20;
const DEFAULT_RECENT_LIMIT = 5;

export type TransactionListItem = {
	_id: Id<"transactions">;
	type: Doc<"transactions">["type"];
	amount: number;
	date: number;
	accountId: Id<"accounts">;
	toAccountId?: Id<"accounts">;
	categoryId: Id<"categories">;
	creditDestinationId?: Id<"creditDestinations">;
	notes?: string;
	accountName: string;
	toAccountName?: string;
	categoryName: string;
	categoryIcon: string;
	categoryColor: string;
	destinationName?: string;
	sortOrder?: number;
	createdAt: number;
	updatedAt: number;
};

export async function enrichTransaction(
	ctx: QueryCtx,
	transaction: Doc<"transactions">,
): Promise<TransactionListItem> {
	const account = await ctx.db.get(transaction.accountId);
	const category = await ctx.db.get(transaction.categoryId);
	const toAccount = transaction.toAccountId
		? await ctx.db.get(transaction.toAccountId)
		: null;
	const destination = transaction.creditDestinationId
		? await ctx.db.get(transaction.creditDestinationId)
		: null;

	return {
		_id: transaction._id,
		type: transaction.type,
		amount: transaction.amount,
		date: transaction.date,
		accountId: transaction.accountId,
		toAccountId: transaction.toAccountId,
		categoryId: transaction.categoryId,
		creditDestinationId: transaction.creditDestinationId,
		notes: transaction.notes,
		accountName: account?.name ?? "Cuenta",
		toAccountName: toAccount?.name,
		categoryName: category?.name ?? "Categoría",
		categoryIcon: category?.icon ?? "package",
		categoryColor: category?.color ?? "#7F8C8D",
		destinationName: destination?.name,
		sortOrder: transaction.sortOrder,
		createdAt: transaction.createdAt,
		updatedAt: transaction.updatedAt,
	};
}

export async function applyBalanceDeltas(
	ctx: MutationCtx,
	deltas: ReturnType<typeof getBalanceDeltas>,
	userId: Id<"users">,
	options?: { allowArchivedReversal?: boolean },
) {
	for (const { accountId, delta } of deltas) {
		const account = await requireAccountOwnership(ctx, userId, accountId);
		if (!options?.allowArchivedReversal && account.archived && delta < 0) {
			throw new Error("Cannot debit archived account");
		}
		await ctx.db.patch(accountId, {
			balance: account.balance + delta,
			updatedAt: Date.now(),
		});
	}
}

export async function validateTransactionInput(
	ctx: QueryCtx,
	userId: Id<"users">,
	input: TransactionLike & { categoryId: Id<"categories"> },
) {
	const amount = validatePositiveCopAmount(input.amount);
	const account = await requireAccountOwnership(ctx, userId, input.accountId);
	if (account.archived) {
		throw new Error("Account is archived");
	}

	const category = await requireCategoryOwnership(
		ctx,
		userId,
		input.categoryId,
	);
	if (category.archived) {
		throw new Error("Category is archived");
	}

	if (category.type !== input.type) {
		throw new Error("Category type does not match transaction type");
	}

	if (input.type === "transfer") {
		if (!input.toAccountId) {
			throw new Error("Transfer requires destination account");
		}
		const toAccount = await requireAccountOwnership(
			ctx,
			userId,
			input.toAccountId,
		);
		if (toAccount.archived) {
			throw new Error("Destination account is archived");
		}
		if (input.accountId === input.toAccountId) {
			throw new Error("Transfer origin and destination must differ");
		}
	} else if (input.toAccountId) {
		throw new Error("Only transfers can have a destination account");
	}

	return amount;
}

export const list = query({
	args: {
		dateFrom: v.optional(v.number()),
		dateTo: v.optional(v.number()),
		accountId: v.optional(v.id("accounts")),
		categoryId: v.optional(v.id("categories")),
		amountMin: v.optional(v.number()),
		amountMax: v.optional(v.number()),
		search: v.optional(v.string()),
		limit: v.optional(v.number()),
		includeCreditMovements: v.optional(v.boolean()),
		creditId: v.optional(v.id("credits")),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);

		let transactions = await ctx.db
			.query("transactions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		const excludedAccountIds = await excludedPersonalFinanceAccountIds(
			ctx,
			userId,
		);
		const includeCredit = args.includeCreditMovements ?? false;
		if (!includeCredit && !args.creditId) {
			transactions = transactions.filter((t) =>
				countsForPersonalFinance(t, excludedAccountIds),
			);
		}
		if (args.creditId) {
			transactions = transactions.filter((t) => t.creditId === args.creditId);
		}

		if (args.dateFrom !== undefined) {
			const dateFrom = args.dateFrom;
			transactions = transactions.filter((t) => t.date >= dateFrom);
		}
		if (args.dateTo !== undefined) {
			const dateTo = args.dateTo;
			transactions = transactions.filter((t) => t.date <= dateTo);
		}
		if (args.accountId) {
			transactions = transactions.filter(
				(t) =>
					t.accountId === args.accountId || t.toAccountId === args.accountId,
			);
		}
		if (args.categoryId) {
			transactions = transactions.filter(
				(t) => t.categoryId === args.categoryId,
			);
		}
		if (args.amountMin !== undefined) {
			const amountMin = args.amountMin;
			transactions = transactions.filter((t) => t.amount >= amountMin);
		}
		if (args.amountMax !== undefined) {
			const amountMax = args.amountMax;
			transactions = transactions.filter((t) => t.amount <= amountMax);
		}

		transactions.sort(compareTransactions);

		const enriched: TransactionListItem[] = [];
		const searchTerm = args.search?.trim().toLowerCase();

		for (const transaction of transactions) {
			const item = await enrichTransaction(ctx, transaction);
			if (searchTerm) {
				const haystack = [
					item.notes ?? "",
					item.accountName,
					item.toAccountName ?? "",
					item.categoryName,
				]
					.join(" ")
					.toLowerCase();
				if (!haystack.includes(searchTerm)) continue;
			}
			enriched.push(item);
			if (args.limit && enriched.length >= args.limit) break;
		}

		return enriched;
	},
});

export const get = query({
	args: {
		transactionId: v.id("transactions"),
	},
	handler: async (ctx, { transactionId }) => {
		const userId = await requireUserId(ctx);
		const transaction = await ctx.db.get(transactionId);
		if (!transaction || transaction.userId !== userId) {
			return null;
		}
		return enrichTransaction(ctx, transaction);
	},
});

export const recent = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { limit }) => {
		const userId = await requireUserId(ctx);
		const capped = Math.min(
			Math.max(limit ?? DEFAULT_RECENT_LIMIT, 1),
			MAX_RECENT_LIMIT,
		);

		const transactions = await ctx.db
			.query("transactions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		transactions.sort(compareTransactions);

		const slice = transactions.slice(0, capped);
		return Promise.all(slice.map((t) => enrichTransaction(ctx, t)));
	},
});

export const create = mutation({
	args: {
		type: transactionTypeValidator,
		amount: v.number(),
		date: v.number(),
		accountId: v.id("accounts"),
		toAccountId: v.optional(v.id("accounts")),
		categoryId: v.id("categories"),
		notes: v.optional(v.string()),
		creditPaymentId: v.optional(v.id("creditPayments")),
		creditFundSpend: v.optional(
			v.object({
				creditId: v.id("credits"),
				destinationId: v.id("creditDestinations"),
			}),
		),
		fixedExpenseId: v.optional(v.id("fixedExpenses")),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const notes = validateTransactionNotes(args.notes);

		if (args.fixedExpenseId) {
			if (args.type !== "expense") {
				throw new Error("Fixed expense payments must be expenses");
			}
			return await registerFixedExpensePayment(ctx, userId, {
				fixedExpenseId: args.fixedExpenseId,
				accountId: args.accountId,
				amount: args.amount,
				date: args.date,
				periodKey: periodKeyFromTimestamp(args.date),
				categoryId: args.categoryId,
				notes,
			});
		}

		if (args.creditFundSpend) {
			if (args.type !== "expense") {
				throw new Error("Credit fund spends must be expenses");
			}
			const result = await executeSpendFromFund(ctx, userId, {
				creditId: args.creditFundSpend.creditId,
				destinationId: args.creditFundSpend.destinationId,
				amount: args.amount,
				categoryId: args.categoryId,
				expenseAccountId: args.accountId,
				notes,
				date: args.date,
			});
			return result.expenseId;
		}

		if (args.creditPaymentId) {
			if (args.type !== "expense") {
				throw new Error("Credit payments must be expenses");
			}
			return await createAndRegisterCreditPayment(ctx, userId, {
				paymentId: args.creditPaymentId,
				paidDate: args.date,
				accountId: args.accountId,
				categoryId: args.categoryId,
				notes,
			});
		}

		const amount = await validateTransactionInput(ctx, userId, args);
		const deltas = getBalanceDeltas({ ...args, amount });
		const now = Date.now();

		await applyBalanceDeltas(ctx, deltas, userId);

		const transactionId = await ctx.db.insert("transactions", {
			userId,
			type: args.type,
			amount,
			date: args.date,
			accountId: args.accountId,
			toAccountId: args.type === "transfer" ? args.toAccountId : undefined,
			categoryId: args.categoryId,
			notes,
			sortOrder: now,
			createdAt: now,
			updatedAt: now,
		});

		if (args.type === "expense") {
			await ctx.scheduler.runAfter(
				0,
				internal.budgets.checkThresholdAfterTransaction,
				{
					userId,
					categoryId: args.categoryId,
					date: args.date,
				},
			);
		}

		return transactionId;
	},
});

export const update = mutation({
	args: {
		transactionId: v.id("transactions"),
		type: transactionTypeValidator,
		amount: v.number(),
		date: v.number(),
		accountId: v.id("accounts"),
		toAccountId: v.optional(v.id("accounts")),
		categoryId: v.id("categories"),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const existing = await requireTransactionOwnership(
			ctx,
			userId,
			args.transactionId,
		);

		const oldDeltas = getBalanceDeltas({
			type: existing.type,
			amount: existing.amount,
			accountId: existing.accountId,
			toAccountId: existing.toAccountId,
		});
		await applyBalanceDeltas(ctx, invertDeltas(oldDeltas), userId, {
			allowArchivedReversal: true,
		});

		const amount = await validateTransactionInput(ctx, userId, args);
		const notes = validateTransactionNotes(args.notes);
		const newDeltas = getBalanceDeltas({ ...args, amount });
		await applyBalanceDeltas(ctx, newDeltas, userId);

		await ctx.db.patch(args.transactionId, {
			type: args.type,
			amount,
			date: args.date,
			accountId: args.accountId,
			toAccountId: args.type === "transfer" ? args.toAccountId : undefined,
			categoryId: args.categoryId,
			notes,
			updatedAt: Date.now(),
		});

		if (args.type === "expense") {
			await ctx.scheduler.runAfter(
				0,
				internal.budgets.checkThresholdAfterTransaction,
				{
					userId,
					categoryId: args.categoryId,
					date: args.date,
				},
			);
		}

		return null;
	},
});

export const reorderWithinDate = mutation({
	args: {
		date: v.number(),
		orderedIds: v.array(v.id("transactions")),
	},
	handler: async (ctx, { date, orderedIds }) => {
		const userId = await requireUserId(ctx);

		if (orderedIds.length < 2) return null;

		const uniqueIds = new Set(orderedIds);
		if (uniqueIds.size !== orderedIds.length) {
			throw new Error("Duplicate transaction ids");
		}

		const transactions = await Promise.all(
			orderedIds.map((id) => requireTransactionOwnership(ctx, userId, id)),
		);

		for (const transaction of transactions) {
			if (transaction.date !== date) {
				throw new Error("All transactions must share the same date");
			}
		}

		const now = Date.now();
		const count = orderedIds.length;
		for (let i = 0; i < orderedIds.length; i++) {
			await ctx.db.patch(orderedIds[i], {
				sortOrder: count - i,
				updatedAt: now,
			});
		}

		return null;
	},
});

export async function removeTransactionForUser(
	ctx: MutationCtx,
	userId: Id<"users">,
	transactionId: Id<"transactions">,
) {
	const transaction = await requireTransactionOwnership(
		ctx,
		userId,
		transactionId,
	);

	const attachments = await ctx.db
		.query("attachments")
		.withIndex("by_entity", (q) =>
			q.eq("entityType", "transaction").eq("entityId", transactionId),
		)
		.collect();

	for (const attachment of attachments) {
		await ctx.storage.delete(attachment.storageId);
		await ctx.db.delete(attachment._id);
	}

	const deltas = getBalanceDeltas({
		type: transaction.type,
		amount: transaction.amount,
		accountId: transaction.accountId,
		toAccountId: transaction.toAccountId,
	});
	await applyBalanceDeltas(ctx, invertDeltas(deltas), userId, {
		allowArchivedReversal: true,
	});

	await clearFixedExpensePaymentForDeletedTransaction(ctx, userId, transaction);

	await revertCreditPaymentForTransaction(ctx, userId, transactionId);

	await revertSavingsContributionForTransaction(ctx, userId, transactionId);

	await ctx.db.delete(transactionId);
}

export const remove = mutation({
	args: {
		transactionId: v.id("transactions"),
	},
	handler: async (ctx, { transactionId }) => {
		const userId = await requireUserId(ctx);
		await removeTransactionForUser(ctx, userId, transactionId);
		return null;
	},
});
