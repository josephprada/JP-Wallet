import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { computeBalanceAdjustment } from "./lib/accountBalanceAdjustment";
import { compareAccounts } from "./lib/accounts";
import {
	requireAccountOwnership,
	requireCreditOwnership,
	requireUserId,
} from "./lib/auth";
import { syncDisbursementAccountIsolation } from "./lib/personalFinance";
import { resolveUserPreferences } from "./lib/preferences";
import {
	accountTypeValidator,
	validateCopAmount,
	validateNonEmptyName,
} from "./lib/validators";

export const list = query({
	args: {
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, { includeArchived }) => {
		const userId = await requireUserId(ctx);
		const accounts = await ctx.db
			.query("accounts")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		const filtered = includeArchived
			? accounts
			: accounts.filter((a) => !a.archived);

		return filtered.sort(compareAccounts);
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		type: accountTypeValidator,
		initialBalance: v.optional(v.number()),
		isCreditEscrow: v.optional(v.boolean()),
		excludeFromPersonalFinance: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ name, type, initialBalance, isCreditEscrow, excludeFromPersonalFinance },
	) => {
		const userId = await requireUserId(ctx);
		const trimmedName = validateNonEmptyName(name);
		const balance = validateCopAmount(initialBalance ?? 0, "initialBalance");
		const now = Date.now();
		const existing = await ctx.db
			.query("accounts")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const maxOrder = existing.reduce(
			(max, account) => Math.max(max, account.sortOrder ?? account.createdAt),
			0,
		);

		return await ctx.db.insert("accounts", {
			userId,
			name: trimmedName,
			type,
			initialBalance: balance,
			balance,
			archived: false,
			isCreditEscrow: isCreditEscrow ?? false,
			excludeFromPersonalFinance: excludeFromPersonalFinance ?? false,
			sortOrder: maxOrder + 1,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const update = mutation({
	args: {
		accountId: v.id("accounts"),
		name: v.string(),
		type: accountTypeValidator,
		isCreditEscrow: v.optional(v.boolean()),
		excludeFromPersonalFinance: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ accountId, name, type, isCreditEscrow, excludeFromPersonalFinance },
	) => {
		const userId = await requireUserId(ctx);
		await requireAccountOwnership(ctx, userId, accountId);
		const trimmedName = validateNonEmptyName(name);

		await ctx.db.patch(accountId, {
			name: trimmedName,
			type,
			...(isCreditEscrow !== undefined ? { isCreditEscrow } : {}),
			...(excludeFromPersonalFinance !== undefined
				? { excludeFromPersonalFinance }
				: {}),
			updatedAt: Date.now(),
		});

		return null;
	},
});

/**
 * Corrección de emergencia del saldo (descuadres por error humano).
 * Solo disponible si el usuario activó el modo en Ajustes. No crea
 * movimientos: ajusta `initialBalance` para que el historial siga cuadrando.
 */
export const adjustBalance = mutation({
	args: {
		accountId: v.id("accounts"),
		balance: v.number(),
	},
	handler: async (ctx, { accountId, balance }) => {
		const userId = await requireUserId(ctx);
		const account = await requireAccountOwnership(ctx, userId, accountId);
		if (account.archived) {
			throw new Error("Account is archived");
		}

		const prefs = await ctx.db
			.query("userPreferences")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();
		if (!resolveUserPreferences(prefs).balanceEditEnabled) {
			throw new Error(
				"Activa la edición de saldos de emergencia en Ajustes para corregir saldos",
			);
		}

		// Puede ser negativo (tarjetas de crédito o sobregiros), pero siempre COP entero.
		if (!Number.isInteger(balance)) {
			throw new Error("balance must be an integer");
		}
		const nextBalance = balance;
		const adjustment = computeBalanceAdjustment(account, nextBalance);
		if (adjustment.delta === 0) return null;

		await ctx.db.patch(accountId, {
			balance: adjustment.balance,
			initialBalance: adjustment.initialBalance,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const reorder = mutation({
	args: {
		orderedIds: v.array(v.id("accounts")),
	},
	handler: async (ctx, { orderedIds }) => {
		const userId = await requireUserId(ctx);

		if (orderedIds.length < 2) return null;

		const uniqueIds = new Set(orderedIds);
		if (uniqueIds.size !== orderedIds.length) {
			throw new Error("Duplicate account ids");
		}

		const accounts = await Promise.all(
			orderedIds.map((id) => requireAccountOwnership(ctx, userId, id)),
		);

		for (const account of accounts) {
			if (account.archived) {
				throw new Error("Cannot reorder archived account");
			}
		}

		const now = Date.now();
		for (let i = 0; i < orderedIds.length; i++) {
			await ctx.db.patch(orderedIds[i], {
				sortOrder: i + 1,
				updatedAt: now,
			});
		}

		return null;
	},
});

export const archive = mutation({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, { accountId }) => {
		const userId = await requireUserId(ctx);
		await requireAccountOwnership(ctx, userId, accountId);
		const now = Date.now();

		await ctx.db.patch(accountId, {
			archived: true,
			archivedAt: now,
			updatedAt: now,
		});

		return null;
	},
});

export const linkToCredit = mutation({
	args: {
		accountId: v.id("accounts"),
		creditId: v.id("credits"),
		role: v.union(v.literal("disbursement"), v.literal("operating")),
		setEscrowBalanceToPrincipal: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		await requireAccountOwnership(ctx, userId, args.accountId);
		const credit = await requireCreditOwnership(ctx, userId, args.creditId);
		const now = Date.now();

		if (args.role === "disbursement") {
			await ctx.db.patch(args.creditId, {
				disbursementAccountId: args.accountId,
				updatedAt: now,
			});
			await syncDisbursementAccountIsolation(
				ctx,
				args.accountId,
				credit.excludeFromPersonalFinance !== false,
			);
			if (args.setEscrowBalanceToPrincipal) {
				await ctx.db.patch(args.accountId, {
					balance: credit.principal,
					initialBalance: credit.principal,
					updatedAt: now,
				});
			}
		} else {
			await ctx.db.patch(args.creditId, {
				operatingAccountId: args.accountId,
				updatedAt: now,
			});
		}

		return null;
	},
});
