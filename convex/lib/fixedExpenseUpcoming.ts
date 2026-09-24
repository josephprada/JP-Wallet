import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasValidPaymentTransaction } from "./fixedExpensePayments";
import { appliesToPeriodKey } from "./fixedExpensePeriod";
import { dueTimestampForPeriodKey } from "./fixedExpenses";
import { periodKeyFromTimestamp } from "./period";

type DbCtx = { db: QueryCtx["db"] | MutationCtx["db"] };

/** Safety cap on months evaluated per call (guards heavy payment lookups). */
export const MAX_UPCOMING_PERIOD_MONTHS = 24;

export type UpcomingFixedExpenseRow = {
	id: Id<"fixedExpenses">;
	name: string;
	amount: number;
	categoryId: Id<"categories">;
	categoryName: string;
	dayOfMonth: number;
	dueDate: number;
	isOverdue: boolean;
	/** Month (YYYY-MM) this occurrence belongs to. */
	periodKey: string;
	/** Always false unless `includePaid` was requested. */
	isPaid: boolean;
	onlyPeriodKey?: string;
};

export type UpcomingFixedExpensesResult = {
	periodStart: number;
	periodEnd: number;
	/** Months (YYYY-MM) evaluated for this range. */
	periodKeys: string[];
	pendingTotal: number;
	/** Sum of paid occurrences; only present with `includePaid`. */
	paidTotal?: number;
	items: UpcomingFixedExpenseRow[];
};

/**
 * Every month key (YYYY-MM) touched by [periodStart, periodEnd], in order.
 * Capped at MAX_UPCOMING_PERIOD_MONTHS.
 */
export function periodKeysInRange(
	periodStart: number,
	periodEnd: number,
): string[] {
	if (periodEnd < periodStart) return [];
	const keys: string[] = [];
	const cursor = new Date(periodStart);
	cursor.setDate(1);
	cursor.setHours(12, 0, 0, 0);
	const lastKey = periodKeyFromTimestamp(periodEnd);
	while (keys.length < MAX_UPCOMING_PERIOD_MONTHS) {
		const key = periodKeyFromTimestamp(cursor.getTime());
		keys.push(key);
		if (key === lastKey) break;
		cursor.setMonth(cursor.getMonth() + 1);
	}
	return keys;
}

/**
 * Shared pending-fixed logic for dashboard + MCP (ownership via userId).
 * Evaluates every month the range touches (not only the month of periodStart).
 * `limit` only truncates `items`; `pendingTotal` is always the full sum.
 */
export async function listUpcomingFixedExpensesForUser(
	ctx: DbCtx,
	userId: Id<"users">,
	periodStart: number,
	periodEnd: number,
	limit = 50,
	options: { includePaid?: boolean } = {},
): Promise<UpcomingFixedExpensesResult> {
	const items = await ctx.db
		.query("fixedExpenses")
		.withIndex("by_user_active", (q) =>
			q.eq("userId", userId).eq("active", true),
		)
		.collect();

	const now = Date.now();
	const rows: UpcomingFixedExpenseRow[] = [];
	let pendingTotal = 0;
	let paidTotal = 0;
	const periodKeys = periodKeysInRange(periodStart, periodEnd);

	for (const item of items) {
		for (const periodKey of periodKeys) {
			if (!appliesToPeriodKey(item, periodKey)) continue;
			if (item.skippedPeriodKey === periodKey) continue;

			const dueTs = dueTimestampForPeriodKey(item.dayOfMonth, periodKey);
			if (dueTs < periodStart || dueTs > periodEnd) continue;

			const isPaid = await hasValidPaymentTransaction(ctx, item, periodKey);
			if (isPaid) {
				if (!options.includePaid) continue;
				paidTotal += item.amount;
			} else {
				pendingTotal += item.amount;
			}
			rows.push(await toRow(ctx, item, dueTs, now, periodKey, isPaid));
		}
	}

	rows.sort((a, b) => a.dueDate - b.dueDate);
	const capped = Math.max(1, Math.min(limit, 100));

	return {
		periodStart,
		periodEnd,
		periodKeys,
		pendingTotal,
		...(options.includePaid ? { paidTotal } : {}),
		items: rows.slice(0, capped),
	};
}

async function toRow(
	ctx: DbCtx,
	item: Doc<"fixedExpenses">,
	dueTs: number,
	now: number,
	periodKey: string,
	isPaid: boolean,
): Promise<UpcomingFixedExpenseRow> {
	const category = await ctx.db.get(item.categoryId);
	return {
		id: item._id,
		name: item.name,
		amount: item.amount,
		categoryId: item.categoryId,
		categoryName: category?.name ?? "Categoría",
		dayOfMonth: item.dayOfMonth,
		dueDate: dueTs,
		isOverdue: !isPaid && dueTs < now,
		periodKey,
		isPaid,
		onlyPeriodKey: item.onlyPeriodKey,
	};
}
