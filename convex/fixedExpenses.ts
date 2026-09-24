import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAccountOwnership, requireCategoryOwnership, requireUserId } from "./lib/auth";
import { getBalanceDeltas, invertDeltas } from "./lib/balance";
import {
	dateKeyFromTimestamp,
	dueTimestampForPeriodKey,
	nextDueTimestamp,
	reminderDatesForMonth,
} from "./lib/fixedExpenses";
import {
	findMatchingPaymentTransaction,
	hasValidPaymentTransaction,
	reconcileFixedExpensePayment,
} from "./lib/fixedExpensePayments";
import { periodKeyFromTimestamp } from "./lib/period";
import {
	appliesToPeriodKey,
	assertAppliesToPeriodKey,
	validateOnlyPeriodKey,
} from "./lib/fixedExpensePeriod";
import {
	resolveFixedExpensePaymentDate,
	resolveFixedExpensePaymentPeriodKey,
} from "./lib/fixedExpensePaymentDate";
import { listUpcomingFixedExpensesForUser } from "./lib/fixedExpenseUpcoming";
import { registerFixedExpensePayment } from "./lib/fixedExpenseTransaction";
import { resolveUserPreferences } from "./lib/preferences";
import {
	ensureSavingsContributionForPaidFixedExpense,
	revertSavingsContributionForTransaction,
} from "./lib/savingsGoalFixedExpense";
import {
	MAX_FIXED_EXPENSE_NAME_LENGTH,
	validateDayOfMonth,
	validatePositiveCopAmount,
	validateReminderOffsets,
} from "./lib/validators";
import { internal } from "./_generated/api";

export type FixedExpenseListItem = {
	_id: Id<"fixedExpenses">;
	name: string;
	amount: number;
	categoryId: Id<"categories">;
	categoryName: string;
	categoryColor: string;
	categoryIcon: string;
	dayOfMonth: number;
	reminderOffsets: number[];
	emailReminders: boolean;
	pushReminders: boolean;
	active: boolean;
	nextDueDate: number;
	lastPaidPeriodKey?: string;
	isPaidCurrentPeriod: boolean;
	isSkippedCurrentPeriod: boolean;
	onlyPeriodKey?: string;
	skippedPeriodKey?: string;
	notes?: string;
};

async function enrichFixedExpense(
	ctx: { db: QueryCtx["db"] },
	item: Doc<"fixedExpenses">,
	periodKey?: string,
): Promise<FixedExpenseListItem> {
	const category = await ctx.db.get(item.categoryId);
	const viewPeriodKey =
		periodKey ?? periodKeyFromTimestamp(Date.now());
	const isPaidCurrentPeriod = await hasValidPaymentTransaction(
		ctx,
		item,
		viewPeriodKey,
	);
	const isSkippedCurrentPeriod = item.skippedPeriodKey === viewPeriodKey;
	return {
		_id: item._id,
		name: item.name,
		amount: item.amount,
		categoryId: item.categoryId,
		categoryName: category?.name ?? "Categoría",
		categoryColor: category?.color ?? "#7F8C8D",
		categoryIcon: category?.icon ?? "package",
		dayOfMonth: item.dayOfMonth,
		reminderOffsets: item.reminderOffsets,
		emailReminders: item.emailReminders,
		pushReminders: item.pushReminders,
		active: item.active,
		nextDueDate: periodKey
			? dueTimestampForPeriodKey(item.dayOfMonth, periodKey)
			: nextDueTimestamp(item.dayOfMonth),
		lastPaidPeriodKey: item.lastPaidPeriodKey,
		isPaidCurrentPeriod,
		isSkippedCurrentPeriod,
		onlyPeriodKey: item.onlyPeriodKey,
		skippedPeriodKey: item.skippedPeriodKey,
		notes: item.notes,
	};
}

export const list = query({
	args: {
		includeInactive: v.optional(v.boolean()),
		periodKey: v.optional(v.string()),
	},
	handler: async (ctx, { includeInactive, periodKey }) => {
		const userId = await requireUserId(ctx);
		let items = await ctx.db
			.query("fixedExpenses")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		if (!includeInactive) {
			items = items.filter((i) => i.active);
		}

		if (periodKey) {
			items = items.filter((i) => appliesToPeriodKey(i, periodKey));
		}

		const enriched = await Promise.all(
			items.map((i) => enrichFixedExpense(ctx, i, periodKey)),
		);
		return enriched.sort((a, b) => a.nextDueDate - b.nextDueDate);
	},
});

export const listUpcomingForPeriod = query({
	args: {
		periodStart: v.number(),
		periodEnd: v.number(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { periodStart, periodEnd, limit = 3 }) => {
		const userId = await requireUserId(ctx);
		const result = await listUpcomingFixedExpensesForUser(
			ctx,
			userId,
			periodStart,
			periodEnd,
			limit,
		);

		// Preserve previous shape: enriched FixedExpenseListItem fields for UI widgets.
		const enrichedItems = await Promise.all(
			result.items.map(async (row) => {
				const doc = await ctx.db.get(row.id);
				if (!doc) return null;
				const enriched = await enrichFixedExpense(ctx, doc, row.periodKey);
				return {
					...enriched,
					dueDate: row.dueDate,
					isOverdue: row.isOverdue,
					nextDueDate: row.dueDate,
					isPaidCurrentPeriod: false as const,
				};
			}),
		);

		return {
			items: enrichedItems.filter(
				(item): item is NonNullable<typeof item> => item !== null,
			),
			pendingTotal: result.pendingTotal,
		};
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		amount: v.number(),
		categoryId: v.id("categories"),
		dayOfMonth: v.number(),
		reminderOffsets: v.optional(v.array(v.number())),
		emailReminders: v.optional(v.boolean()),
		pushReminders: v.optional(v.boolean()),
		notes: v.optional(v.string()),
		onlyPeriodKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const name = args.name.trim();
		if (!name || name.length > MAX_FIXED_EXPENSE_NAME_LENGTH) {
			throw new Error("Invalid name");
		}
		const amount = validatePositiveCopAmount(args.amount);
		const dayOfMonth = validateDayOfMonth(args.dayOfMonth);
		const reminderOffsets = validateReminderOffsets(
			args.reminderOffsets ?? [2, 0],
		);

		const category = await requireCategoryOwnership(
			ctx,
			userId,
			args.categoryId,
		);
		if (category.type !== "expense") {
			throw new Error("Only expense categories allowed");
		}

		const now = Date.now();
		return await ctx.db.insert("fixedExpenses", {
			userId,
			name,
			amount,
			categoryId: args.categoryId,
			dayOfMonth,
			reminderOffsets,
			emailReminders: args.emailReminders ?? false,
			pushReminders: args.pushReminders ?? true,
			active: true,
			onlyPeriodKey: args.onlyPeriodKey
				? validateOnlyPeriodKey(args.onlyPeriodKey)
				: undefined,
			notes: args.notes?.trim().slice(0, 200) || undefined,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const update = mutation({
	args: {
		id: v.id("fixedExpenses"),
		name: v.optional(v.string()),
		amount: v.optional(v.number()),
		categoryId: v.optional(v.id("categories")),
		dayOfMonth: v.optional(v.number()),
		reminderOffsets: v.optional(v.array(v.number())),
		emailReminders: v.optional(v.boolean()),
		pushReminders: v.optional(v.boolean()),
		active: v.optional(v.boolean()),
		notes: v.optional(v.string()),
		onlyPeriodKey: v.optional(v.string()),
		clearOnlyPeriodKey: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(args.id);
		if (!item || item.userId !== userId) {
			throw new Error("Fixed expense not found");
		}

		const patch: Partial<Doc<"fixedExpenses">> = { updatedAt: Date.now() };

		if (args.name !== undefined) {
			const name = args.name.trim();
			if (!name) throw new Error("Name is required");
			patch.name = name;
		}
		if (args.amount !== undefined) {
			patch.amount = validatePositiveCopAmount(args.amount);
		}
		if (args.categoryId !== undefined) {
			const cat = await requireCategoryOwnership(ctx, userId, args.categoryId);
			if (cat.type !== "expense") throw new Error("Only expense categories");
			patch.categoryId = args.categoryId;
		}
		if (args.dayOfMonth !== undefined) {
			patch.dayOfMonth = validateDayOfMonth(args.dayOfMonth);
		}
		if (args.reminderOffsets !== undefined) {
			patch.reminderOffsets = validateReminderOffsets(args.reminderOffsets);
		}
		if (args.emailReminders !== undefined) patch.emailReminders = args.emailReminders;
		if (args.pushReminders !== undefined) patch.pushReminders = args.pushReminders;
		if (args.active !== undefined) patch.active = args.active;
		if (args.notes !== undefined) {
			patch.notes = args.notes.trim().slice(0, 200) || undefined;
		}
		if (args.clearOnlyPeriodKey) {
			patch.onlyPeriodKey = undefined;
		} else if (args.onlyPeriodKey !== undefined) {
			patch.onlyPeriodKey = validateOnlyPeriodKey(args.onlyPeriodKey);
		}

		await ctx.db.patch(args.id, patch);
		return null;
	},
});

export const remove = mutation({
	args: { id: v.id("fixedExpenses") },
	handler: async (ctx, { id }) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(id);
		if (!item || item.userId !== userId) {
			throw new Error("Fixed expense not found");
		}
		await ctx.db.delete(id);
		return null;
	},
});

export const skipThisMonth = mutation({
	args: {
		id: v.id("fixedExpenses"),
		periodKey: v.optional(v.string()),
	},
	handler: async (ctx, { id, periodKey }) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(id);
		if (!item || item.userId !== userId) {
			throw new Error("Fixed expense not found");
		}
		const key = periodKey
			? validateOnlyPeriodKey(periodKey)
			: periodKeyFromTimestamp(Date.now());
		await ctx.db.patch(id, {
			skippedPeriodKey: key,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const clearSkipThisMonth = mutation({
	args: { id: v.id("fixedExpenses") },
	handler: async (ctx, { id }) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(id);
		if (!item || item.userId !== userId) {
			throw new Error("Fixed expense not found");
		}
		await ctx.db.patch(id, {
			skippedPeriodKey: undefined,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const markPaid = mutation({
	args: {
		id: v.id("fixedExpenses"),
		accountId: v.id("accounts"),
		periodKey: v.optional(v.string()),
		dueDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(args.id);
		if (!item || item.userId !== userId) {
			throw new Error("Fixed expense not found");
		}

		// Anchor the transaction inside the period being paid and never in the future.
		const nowTs = Date.now();
		const periodKey = resolveFixedExpensePaymentPeriodKey({
			periodKey: args.periodKey,
			dueDate: args.dueDate,
			now: nowTs,
		});
		const paymentDate = resolveFixedExpensePaymentDate({ now: nowTs });

		await registerFixedExpensePayment(ctx, userId, {
			fixedExpenseId: args.id,
			accountId: args.accountId,
			amount: item.amount,
			date: paymentDate,
			periodKey,
			categoryId: item.categoryId,
			notes: item.name,
		});

		return null;
	},
});

export const acknowledgePaidForPeriod = mutation({
	args: {
		id: v.id("fixedExpenses"),
		periodKey: v.optional(v.string()),
		dueDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(args.id);
		if (!item || item.userId !== userId) {
			throw new Error("Fixed expense not found");
		}

		const periodKey = resolveFixedExpensePaymentPeriodKey({
			periodKey: args.periodKey,
			dueDate: args.dueDate,
			now: Date.now(),
		});

		if (item.lastPaidPeriodKey === periodKey) {
			return null;
		}

		assertAppliesToPeriodKey(item, periodKey);

		const matching = await findMatchingPaymentTransaction(
			ctx,
			item,
			periodKey,
		);
		const now = Date.now();
		const patch: Partial<Doc<"fixedExpenses">> = {
			lastPaidPeriodKey: periodKey,
			updatedAt: now,
		};

		if (matching) {
			patch.lastPaidTransactionId = matching._id;
			if (!matching.sourceFixedExpenseId) {
				await ctx.db.patch(matching._id, {
					sourceFixedExpenseId: item._id,
					updatedAt: now,
				});
			}
		}

		await ctx.db.patch(args.id, patch);

		await ensureSavingsContributionForPaidFixedExpense(ctx, {
			userId,
			fixedExpense: { ...item, ...patch },
		});

		return null;
	},
});

export const unmarkPaid = mutation({
	args: { id: v.id("fixedExpenses") },
	handler: async (ctx, { id }) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(id);
		if (!item || item.userId !== userId) {
			throw new Error("Fixed expense not found");
		}

		const now = Date.now();

		if (item.lastPaidTransactionId) {
			const transaction = await ctx.db.get(item.lastPaidTransactionId);
			if (transaction && transaction.userId === userId) {
				await revertSavingsContributionForTransaction(
					ctx,
					userId,
					transaction._id,
				);

				const deltas = getBalanceDeltas({
					type: transaction.type,
					amount: transaction.amount,
					accountId: transaction.accountId,
					toAccountId: transaction.toAccountId,
				});
				for (const { accountId, delta } of invertDeltas(deltas)) {
					const account = await requireAccountOwnership(
						ctx,
						userId,
						accountId,
					);
					await ctx.db.patch(accountId, {
						balance: account.balance + delta,
						updatedAt: now,
					});
				}

				await ctx.db.delete(transaction._id);
			}
		}

		await ctx.db.patch(id, {
			lastPaidPeriodKey: undefined,
			lastPaidTransactionId: undefined,
			updatedAt: now,
		});
		return null;
	},
});

export const reconcilePayments = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const items = await ctx.db
			.query("fixedExpenses")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		let repaired = 0;
		for (const item of items) {
			if (await reconcileFixedExpensePayment(ctx, item)) {
				repaired += 1;
			}
			await ensureSavingsContributionForPaidFixedExpense(ctx, {
				userId,
				fixedExpense: item,
			});
		}

		return { repaired };
	},
});

export const processReminders = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const nowTs = now.getTime();
		const todayKey = dateKeyFromTimestamp(nowTs);
		const year = now.getFullYear();
		const monthIndex = now.getMonth();
		const currentPeriodKey = periodKeyFromTimestamp(nowTs);
		const dayMs = 24 * 60 * 60 * 1000;

		const items = await ctx.db.query("fixedExpenses").collect();

		for (const item of items) {
			if (!item.active) continue;

			if (item.onlyPeriodKey && item.onlyPeriodKey !== currentPeriodKey) {
				continue;
			}

			if (item.skippedPeriodKey === currentPeriodKey) continue;

			if (await hasValidPaymentTransaction(ctx, item, currentPeriodKey)) {
				continue;
			}

			const prefsDoc = await ctx.db
				.query("userPreferences")
				.withIndex("by_user", (q) => q.eq("userId", item.userId))
				.unique();
			const prefs = resolveUserPreferences(prefsDoc);
			if (!prefs.notificationsEnabled) continue;

			const amountLabel = `$${item.amount.toLocaleString("es-CO")}`;
			const channels: Array<"email" | "push" | "in_app"> = ["in_app"];
			if (item.emailReminders) channels.push("email");
			if (item.pushReminders && prefs.pushEnabled) channels.push("push");

			const reminderDates = reminderDatesForMonth(
				year,
				monthIndex,
				item.dayOfMonth,
				item.reminderOffsets,
			);

			for (const reminderTs of reminderDates) {
				if (dateKeyFromTimestamp(reminderTs) !== todayKey) continue;

				const offset = item.reminderOffsets.find((o) => {
					const d = reminderDatesForMonth(
						year,
						monthIndex,
						item.dayOfMonth,
						[o],
					)[0];
					return dateKeyFromTimestamp(d) === todayKey;
				});

				const when =
					offset === 0
						? "vence hoy"
						: offset === 1
							? "vence mañana"
							: `vence en ${offset ?? 0} días`;

				await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
					userId: item.userId,
					type: "fixed_expense_reminder",
					referenceId: `${item._id}:${offset ?? 0}`,
					channels,
					payload: {
						title: `${item.name} · ${amountLabel}`,
						body: `Gasto fijo ${when} (día ${item.dayOfMonth}). Ábrelo en Presupuestos.`,
						url: "/budgets",
						emailSubject: `Recordatorio — ${item.name}`,
						emailHtml: `<p>Recuerda pagar <strong>${item.name}</strong>: <strong>${amountLabel}</strong> (${when}).</p>`,
					},
					dateKey: todayKey,
					dedupeSuffix: String(offset ?? 0),
				});
			}

			const dueTs = dueTimestampForPeriodKey(
				item.dayOfMonth,
				currentPeriodKey,
			);
			const dueStart = new Date(dueTs);
			dueStart.setHours(0, 0, 0, 0);
			const todayStart = new Date(now);
			todayStart.setHours(0, 0, 0, 0);
			const daysOverdue = Math.round(
				(todayStart.getTime() - dueStart.getTime()) / dayMs,
			);

			if (daysOverdue === 3 || daysOverdue === 6) {
				const overdueChannels: Array<"email" | "push" | "in_app"> = ["in_app"];
				if (item.pushReminders && prefs.pushEnabled) {
					overdueChannels.push("push");
				}

				await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
					userId: item.userId,
					type: "fixed_expense_overdue",
					referenceId: `${item._id}:overdue-${daysOverdue}`,
					channels: overdueChannels,
					payload: {
						title: `${item.name} sin pagar`,
						body: `Llevas ${daysOverdue} días de mora · ${amountLabel}. Márcalo pagado u omítelo este mes.`,
						url: "/budgets",
					},
					dateKey: todayKey,
					dedupeSuffix: `overdue-${daysOverdue}`,
				});
			}
		}

		return null;
	},
});
