import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { type MutationCtx, internalMutation } from "./_generated/server";
import {
	assertCategoriesAvailableForPeriod,
	validateExpenseCategories,
} from "./budgets";
import { compareAccounts } from "./lib/accounts";
import { type ApiScope, hasAnyScope } from "./lib/apiScopes";
import {
	AgentGatewayError,
	type AgentGatewayErrorCode,
	type AuthenticatedApiToken,
	assertScopes,
	authenticateApiTokenByHash,
	recordAudit,
} from "./lib/apiTokenAuth";
import {
	assertTaxDocumentEditable,
	requireAccountOwnership,
	requireSavingsGoalOwnership,
	requireTaxDocumentOwnership,
	requireTaxItemOwnership,
	requireTransactionOwnership,
} from "./lib/auth";
import { getBalanceDeltas, invertDeltas } from "./lib/balance";
import { listUpcomingFixedExpensesForUser } from "./lib/fixedExpenseUpcoming";
import {
	type GroupingId,
	periodKeyFromTimestamp,
	periodKeyToMonthRange,
	periodRangeForGrouping,
} from "./lib/period";
import {
	countsForPersonalFinance,
	excludedPersonalFinanceAccountIds,
	isAccountExcludedFromPersonalFinance,
	personalFinanceExpenseAmount,
} from "./lib/personalFinance";
import { aggregateTransactions } from "./lib/reports";
import { insertSavingsGoalTransferTransaction } from "./lib/savingsGoalTransaction";
import { type TaxSection, assertTaxCategory } from "./lib/taxCategories";
import { computeSectionTotals } from "./lib/taxTotals";
import { compareTransactions } from "./lib/transactions";
import {
	AGENT_RATE_LIMIT_MAX,
	AGENT_RATE_LIMIT_WINDOW_MS,
	MAX_BUDGET_NOTES_LENGTH,
	validateCreditName,
	validateCreditNotes,
	validatePeriodKey,
	validatePositiveCopAmount,
	validateTaxItemDescription,
	validateTaxItemNotes,
	validateTransactionNotes,
} from "./lib/validators";
import {
	applyBalanceDeltas,
	enrichTransaction,
	removeTransactionForUser,
	validateTransactionInput,
} from "./transactions";

// ---------------------------------------------------------------------------
// Arg coercion helpers — RPC args arrive as untyped JSON over HTTP.
// ---------------------------------------------------------------------------

function asString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new AgentGatewayError("validation", `${field} is required`);
	}
	return value;
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new AgentGatewayError("validation", `${field} must be a number`);
	}
	return value;
}

function asOptionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function asId<Table extends TableNames>(
	value: unknown,
	field: string,
): Id<Table> {
	if (typeof value !== "string" || value.length === 0) {
		throw new AgentGatewayError("validation", `${field} is required`);
	}
	return value as Id<Table>;
}

function asOptionalId<Table extends TableNames>(
	value: unknown,
): Id<Table> | undefined {
	return typeof value === "string" && value.length > 0
		? (value as Id<Table>)
		: undefined;
}

function asIdArray<Table extends TableNames>(
	value: unknown,
	field: string,
): Id<Table>[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new AgentGatewayError(
			"validation",
			`${field} must be a non-empty array`,
		);
	}
	return value.map((entry) => asId<Table>(entry, field));
}

function asTransactionType(value: unknown): "income" | "expense" | "transfer" {
	if (value === "income" || value === "expense" || value === "transfer") {
		return value;
	}
	throw new AgentGatewayError(
		"validation",
		"type must be income, expense or transfer",
	);
}

const TAX_SECTIONS_SET = new Set<string>([
	"assets",
	"liabilities",
	"income",
	"deductions",
	"exempt",
]);

function asTaxSection(value: unknown): TaxSection {
	if (typeof value === "string" && TAX_SECTIONS_SET.has(value)) {
		return value as TaxSection;
	}
	throw new AgentGatewayError("validation", "Invalid tax section");
}

function clampLimit(
	value: number | undefined,
	fallback: number,
	max: number,
): number {
	if (value === undefined) return fallback;
	return Math.min(Math.max(Math.trunc(value), 1), max);
}

// ---------------------------------------------------------------------------
// America/Bogota is fixed at UTC-5 year-round (no DST).
// ---------------------------------------------------------------------------

const BOGOTA_OFFSET_MINUTES = -5 * 60;

function bogotaMonthBounds(referenceMs: number = Date.now()): {
	start: number;
	end: number;
} {
	return bogotaPeriodBounds("month", referenceMs);
}

/** America/Bogota calendar-month bounds (absolute ms) for a 'YYYY-MM' key. */
function bogotaMonthBoundsForPeriodKey(periodKey: string): {
	start: number;
	end: number;
} {
	const { start, end } = periodKeyToMonthRange(periodKey);
	return {
		start: start - BOGOTA_OFFSET_MINUTES * 60_000,
		end: end - BOGOTA_OFFSET_MINUTES * 60_000,
	};
}

const MAX_FIXED_EXPENSE_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

/** Period bounds in absolute ms for America/Bogota wall-clock calendar. */
function bogotaPeriodBounds(
	grouping: GroupingId,
	referenceMs: number = Date.now(),
): { start: number; end: number } {
	const bogotaWallClockMs = referenceMs + BOGOTA_OFFSET_MINUTES * 60_000;
	const bogotaDate = new Date(bogotaWallClockMs);
	const anchor = new Date(
		bogotaDate.getUTCFullYear(),
		bogotaDate.getUTCMonth(),
		bogotaDate.getUTCDate(),
		12,
		0,
		0,
		0,
	);
	const range = periodRangeForGrouping(grouping, anchor);
	return {
		start: range.start - BOGOTA_OFFSET_MINUTES * 60_000,
		end: range.end - BOGOTA_OFFSET_MINUTES * 60_000,
	};
}

function asOptionalGrouping(value: unknown): GroupingId | undefined {
	if (
		value === "week" ||
		value === "month" ||
		value === "quarter" ||
		value === "semester"
	) {
		return value;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

async function toolGetFinancialOverview(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const periodStart = asOptionalNumber(args.periodStart);
	const periodEnd = asOptionalNumber(args.periodEnd);
	const grouping = asOptionalGrouping(args.period);
	const bounds =
		periodStart !== undefined && periodEnd !== undefined
			? { start: periodStart, end: periodEnd }
			: bogotaPeriodBounds(grouping ?? "month");

	const accounts = await ctx.db
		.query("accounts")
		.withIndex("by_user_archived", (q) =>
			q.eq("userId", userId).eq("archived", false),
		)
		.collect();
	const personalAccounts = accounts.filter(
		(a) => !isAccountExcludedFromPersonalFinance(a),
	);
	const availableAccounts = personalAccounts.filter((a) => a.type !== "credit");
	const totalBalance = availableAccounts.reduce((sum, a) => sum + a.balance, 0);

	const transactions = await ctx.db
		.query("transactions")
		.withIndex("by_user_date", (q) => q.eq("userId", userId))
		.collect();
	const excludedAccountIds = await excludedPersonalFinanceAccountIds(
		ctx,
		userId,
	);
	const personalTransactions = transactions.filter((t) =>
		countsForPersonalFinance(t, excludedAccountIds),
	);
	const sorted = [...personalTransactions].sort(compareTransactions);
	const periodTransactions = sorted.filter(
		(t) => t.date >= bounds.start && t.date <= bounds.end,
	);

	let monthlyIncome = 0;
	let monthlyExpense = 0;
	for (const t of periodTransactions) {
		if (t.type === "income") monthlyIncome += t.amount;
		monthlyExpense += personalFinanceExpenseAmount(t, excludedAccountIds);
	}

	const recentTransactions = await Promise.all(
		sorted.slice(0, 5).map((t) => enrichTransaction(ctx, t)),
	);

	return {
		periodStart: bounds.start,
		periodEnd: bounds.end,
		totalBalance,
		monthlyIncome,
		monthlyExpense,
		activeAccounts: personalAccounts.length,
		recentTransactions,
	};
}

async function toolListTransactions(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	// MCP schema uses from/to; gateway historically used dateFrom/dateTo.
	const dateFrom =
		asOptionalNumber(args.dateFrom) ?? asOptionalNumber(args.from);
	const dateTo = asOptionalNumber(args.dateTo) ?? asOptionalNumber(args.to);
	const accountId = asOptionalId<"accounts">(args.accountId);
	const categoryId = asOptionalId<"categories">(args.categoryId);
	const limit = clampLimit(asOptionalNumber(args.limit), 50, 100);

	let transactions = await ctx.db
		.query("transactions")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();

	const excludedAccountIds = await excludedPersonalFinanceAccountIds(
		ctx,
		userId,
	);
	transactions = transactions.filter((t) =>
		countsForPersonalFinance(t, excludedAccountIds),
	);

	if (dateFrom !== undefined) {
		transactions = transactions.filter((t) => t.date >= dateFrom);
	}
	if (dateTo !== undefined) {
		transactions = transactions.filter((t) => t.date <= dateTo);
	}
	if (accountId) {
		transactions = transactions.filter(
			(t) => t.accountId === accountId || t.toAccountId === accountId,
		);
	}
	if (categoryId) {
		transactions = transactions.filter((t) => t.categoryId === categoryId);
	}

	transactions.sort(compareTransactions);
	const sliced = transactions.slice(0, limit);
	return Promise.all(sliced.map((t) => enrichTransaction(ctx, t)));
}

async function toolGetSpendingSummary(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const from = asNumber(args.from, "from");
	const to = asNumber(args.to, "to");

	const transactions = await ctx.db
		.query("transactions")
		.withIndex("by_user_date", (q) => q.eq("userId", userId))
		.collect();
	const excludedAccountIds = await excludedPersonalFinanceAccountIds(
		ctx,
		userId,
	);
	const personalTransactions = transactions.filter((t) =>
		countsForPersonalFinance(t, excludedAccountIds),
	);

	const categories = await ctx.db
		.query("categories")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const catMap = new Map(categories.map((c) => [c._id, c]));

	return aggregateTransactions(
		personalTransactions,
		catMap,
		{ periodStart: from, periodEnd: to },
		"month",
		excludedAccountIds,
	);
}

async function toolListAccounts(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const includeArchived = asOptionalBoolean(args.includeArchived) ?? false;
	const accounts = await ctx.db
		.query("accounts")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const filtered = includeArchived
		? accounts
		: accounts.filter((a) => !a.archived);
	return filtered.sort(compareAccounts);
}

async function toolListCategories(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const includeArchived = asOptionalBoolean(args.includeArchived) ?? false;
	const categories = await ctx.db
		.query("categories")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const filtered = includeArchived
		? categories
		: categories.filter((c) => !c.archived);
	return filtered.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

async function toolListBudgets(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	// MCP schema uses `period`; gateway historically used `periodKey`.
	const rawPeriodKey =
		asOptionalString(args.periodKey) ?? asOptionalString(args.period);
	const periodKey = rawPeriodKey
		? validatePeriodKey(rawPeriodKey)
		: periodKeyFromTimestamp(bogotaMonthBounds().start);

	const budgets = await ctx.db
		.query("budgets")
		.withIndex("by_user_period", (q) =>
			q.eq("userId", userId).eq("periodKey", periodKey),
		)
		.collect();

	return Promise.all(
		budgets.map(async (budget) => {
			const { start, end } = periodKeyToMonthRange(budget.periodKey);
			let spent = 0;
			for (const categoryId of budget.categoryIds) {
				const categoryTransactions = await ctx.db
					.query("transactions")
					.withIndex("by_user_category", (q) =>
						q.eq("userId", userId).eq("categoryId", categoryId),
					)
					.collect();
				for (const t of categoryTransactions) {
					if (t.type === "expense" && t.date >= start && t.date <= end) {
						spent += t.amount;
					}
				}
			}
			return {
				_id: budget._id,
				categoryIds: budget.categoryIds,
				amount: budget.amount,
				spent,
				remaining: budget.amount - spent,
				percent: budget.amount > 0 ? spent / budget.amount : 0,
				periodKey: budget.periodKey,
				notes: budget.notes,
			};
		}),
	);
}

async function toolListFixedExpenses(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	// `period` ('YYYY-MM') wins over raw timestamps: agents often compute epoch
	// ms with the wrong year or in UTC instead of America/Bogota.
	const rawPeriodKey =
		asOptionalString(args.period) ?? asOptionalString(args.periodKey);
	const bounds = rawPeriodKey
		? bogotaMonthBoundsForPeriodKey(validatePeriodKey(rawPeriodKey))
		: bogotaMonthBounds();
	const periodStart = rawPeriodKey
		? bounds.start
		: (asOptionalNumber(args.periodStart) ?? bounds.start);
	const periodEnd = rawPeriodKey
		? bounds.end
		: (asOptionalNumber(args.periodEnd) ?? bounds.end);
	const limit = asOptionalNumber(args.limit) ?? 50;
	const includePaid = asOptionalBoolean(args.includePaid) ?? false;

	if (periodEnd < periodStart) {
		throw new AgentGatewayError(
			"validation",
			"periodEnd must be >= periodStart",
		);
	}
	if (periodEnd - periodStart > MAX_FIXED_EXPENSE_RANGE_MS) {
		throw new AgentGatewayError(
			"validation",
			"Range too large: max 366 days",
		);
	}

	return listUpcomingFixedExpensesForUser(
		ctx,
		userId,
		periodStart,
		periodEnd,
		limit,
		{ includePaid },
	);
}

async function toolListCredits(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const status = asOptionalString(args.status) === "all" ? "all" : "active";
	const credits = await ctx.db
		.query("credits")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const filtered =
		status === "all" ? credits : credits.filter((c) => c.status === "active");
	return filtered.map((c) => ({
		_id: c._id,
		name: c.name,
		lender: c.lender,
		principal: c.principal,
		outstandingBalance: c.outstandingBalance,
		interestRate: c.interestRate,
		termMonths: c.termMonths,
		status: c.status,
	}));
}

async function toolListSavingsGoals(ctx: MutationCtx, userId: Id<"users">) {
	const goals = await ctx.db
		.query("savingsGoals")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	return goals.map((g) => ({
		_id: g._id,
		name: g.name,
		targetAmount: g.targetAmount,
		currentAmount: g.currentAmount,
		percent: g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0,
		remaining: Math.max(0, g.targetAmount - g.currentAmount),
		deadline: g.deadline,
		status: g.status,
	}));
}

async function toolListTaxDocuments(ctx: MutationCtx, userId: Id<"users">) {
	const documents = await ctx.db
		.query("taxDocuments")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();

	const enriched = await Promise.all(
		documents.map(async (doc) => {
			const items = await ctx.db
				.query("taxItems")
				.withIndex("by_document", (q) => q.eq("documentId", doc._id))
				.collect();
			return {
				_id: doc._id,
				taxYear: doc.taxYear,
				status: doc.status,
				filedAt: doc.filedAt,
				updatedAt: doc.updatedAt,
				totals: computeSectionTotals(items),
				itemCount: items.length,
			};
		}),
	);

	return enriched.sort((a, b) => b.taxYear - a.taxYear);
}

async function toolGetTaxDocument(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const documentId = asId<"taxDocuments">(args.documentId, "documentId");
	const includeItems = asOptionalBoolean(args.includeItems) ?? false;
	const document = await requireTaxDocumentOwnership(ctx, userId, documentId);
	const items = await ctx.db
		.query("taxItems")
		.withIndex("by_document", (q) => q.eq("documentId", documentId))
		.collect();

	return {
		_id: document._id,
		taxYear: document.taxYear,
		status: document.status,
		estimatedTaxableIncome: document.estimatedTaxableIncome,
		estimatedTaxDue: document.estimatedTaxDue,
		notes: document.notes,
		filedAt: document.filedAt,
		totals: computeSectionTotals(items),
		itemCount: items.length,
		items: includeItems ? items : undefined,
	};
}

// ---------------------------------------------------------------------------
// Write tools
// ---------------------------------------------------------------------------

async function toolCreateTransaction(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const type = asTransactionType(args.type);
	const amount = asNumber(args.amount, "amount");
	const date = asNumber(args.date, "date");
	const accountId = asId<"accounts">(args.accountId, "accountId");
	const categoryId = asId<"categories">(args.categoryId, "categoryId");
	const toAccountId = asOptionalId<"accounts">(args.toAccountId);
	const notes = validateTransactionNotes(asOptionalString(args.notes));

	const validatedAmount = await validateTransactionInput(ctx, userId, {
		type,
		amount,
		accountId,
		categoryId,
		toAccountId,
	});
	const deltas = getBalanceDeltas({
		type,
		amount: validatedAmount,
		accountId,
		toAccountId,
	});
	const now = Date.now();
	await applyBalanceDeltas(ctx, deltas, userId);

	const transactionId = await ctx.db.insert("transactions", {
		userId,
		type,
		amount: validatedAmount,
		date,
		accountId,
		toAccountId: type === "transfer" ? toAccountId : undefined,
		categoryId,
		notes,
		sortOrder: now,
		createdAt: now,
		updatedAt: now,
	});

	if (type === "expense") {
		await ctx.scheduler.runAfter(
			0,
			internal.budgets.checkThresholdAfterTransaction,
			{ userId, categoryId, date },
		);
	}

	return { transactionId };
}

async function toolUpdateTransaction(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const transactionId = asId<"transactions">(
		args.transactionId,
		"transactionId",
	);
	const existing = await requireTransactionOwnership(
		ctx,
		userId,
		transactionId,
	);

	const type =
		args.type !== undefined ? asTransactionType(args.type) : existing.type;
	const amount =
		args.amount !== undefined
			? asNumber(args.amount, "amount")
			: existing.amount;
	const date =
		args.date !== undefined ? asNumber(args.date, "date") : existing.date;
	const accountId =
		args.accountId !== undefined
			? asId<"accounts">(args.accountId, "accountId")
			: existing.accountId;
	const categoryId =
		args.categoryId !== undefined
			? asId<"categories">(args.categoryId, "categoryId")
			: existing.categoryId;
	const toAccountId =
		args.toAccountId !== undefined
			? asOptionalId<"accounts">(args.toAccountId)
			: existing.toAccountId;
	const notes =
		args.notes !== undefined
			? validateTransactionNotes(asOptionalString(args.notes))
			: existing.notes;

	const oldDeltas = getBalanceDeltas({
		type: existing.type,
		amount: existing.amount,
		accountId: existing.accountId,
		toAccountId: existing.toAccountId,
	});
	await applyBalanceDeltas(ctx, invertDeltas(oldDeltas), userId, {
		allowArchivedReversal: true,
	});

	const validatedAmount = await validateTransactionInput(ctx, userId, {
		type,
		amount,
		accountId,
		categoryId,
		toAccountId,
	});
	const newDeltas = getBalanceDeltas({
		type,
		amount: validatedAmount,
		accountId,
		toAccountId,
	});
	await applyBalanceDeltas(ctx, newDeltas, userId);

	await ctx.db.patch(transactionId, {
		type,
		amount: validatedAmount,
		date,
		accountId,
		toAccountId: type === "transfer" ? toAccountId : undefined,
		categoryId,
		notes,
		updatedAt: Date.now(),
	});

	if (type === "expense") {
		await ctx.scheduler.runAfter(
			0,
			internal.budgets.checkThresholdAfterTransaction,
			{ userId, categoryId, date },
		);
	}

	return { transactionId };
}

/**
 * Normalizes MCP-facing upsert_budget args into the internal budget shape.
 * Public MCP schema uses singular `categoryId` / `limit` / `period` / `budgetId`;
 * Convex stores `categoryIds[]` / `amount` / `periodKey` / `_id`.
 */
function resolveBudgetCategoryIds(
	args: Record<string, unknown>,
): Id<"categories">[] {
	if (Array.isArray(args.categoryIds)) {
		return asIdArray<"categories">(args.categoryIds, "categoryIds");
	}
	if (typeof args.categoryId === "string" && args.categoryId.length > 0) {
		return [asId<"categories">(args.categoryId, "categoryId")];
	}
	throw new AgentGatewayError(
		"validation",
		"categoryId (string) or categoryIds (non-empty array) is required",
	);
}

function resolveBudgetAmount(args: Record<string, unknown>): number {
	if (args.amount !== undefined) {
		return validatePositiveCopAmount(asNumber(args.amount, "amount"));
	}
	if (args.limit !== undefined) {
		return validatePositiveCopAmount(asNumber(args.limit, "limit"));
	}
	throw new AgentGatewayError(
		"validation",
		"limit or amount is required (COP integer > 0)",
	);
}

async function toolUpsertBudget(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const categoryIds = resolveBudgetCategoryIds(args);
	const amount = resolveBudgetAmount(args);
	const notes = asOptionalString(args.notes)
		?.trim()
		.slice(0, MAX_BUDGET_NOTES_LENGTH);
	const id =
		asOptionalId<"budgets">(args.id) ??
		asOptionalId<"budgets">(args.budgetId);

	await validateExpenseCategories(ctx, userId, categoryIds);

	if (id) {
		const budget = await ctx.db.get(id);
		if (!budget || budget.userId !== userId) {
			throw new AgentGatewayError("not_found", "Budget not found");
		}
		await assertCategoriesAvailableForPeriod(
			ctx,
			userId,
			budget.periodKey,
			categoryIds,
			id,
		);
		await ctx.db.patch(id, {
			categoryIds,
			amount,
			notes: notes || undefined,
			updatedAt: Date.now(),
		});
		return { budgetId: id };
	}

	const periodRaw = args.periodKey ?? args.period;
	const periodKey = validatePeriodKey(
		asString(periodRaw, args.periodKey !== undefined ? "periodKey" : "period"),
	);
	await assertCategoriesAvailableForPeriod(ctx, userId, periodKey, categoryIds);
	const now = Date.now();
	const budgetId = await ctx.db.insert("budgets", {
		userId,
		categoryIds,
		amount,
		periodKey,
		notes: notes || undefined,
		createdAt: now,
		updatedAt: now,
	});
	return { budgetId };
}

async function toolCreateSavingsGoal(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const name = validateCreditName(asString(args.name, "name"));
	const targetAmount = validatePositiveCopAmount(
		asNumber(args.targetAmount, "targetAmount"),
	);
	// MCP schema uses `targetDate`; Convex field is `deadline`.
	const deadline =
		asOptionalNumber(args.deadline) ?? asOptionalNumber(args.targetDate);
	const accountId = asOptionalId<"accounts">(args.accountId);
	const notes = validateCreditNotes(asOptionalString(args.notes));

	if (accountId) {
		await requireAccountOwnership(ctx, userId, accountId);
	}

	const now = Date.now();
	const goalId = await ctx.db.insert("savingsGoals", {
		userId,
		name,
		targetAmount,
		currentAmount: 0,
		deadline,
		accountId,
		status: "active",
		notes,
		createdAt: now,
		updatedAt: now,
	});
	return { goalId };
}

async function toolContributeToGoal(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const goalId = asId<"savingsGoals">(args.goalId, "goalId");
	const amount = validatePositiveCopAmount(asNumber(args.amount, "amount"));
	// MCP schema omits contributedAt; default to now so agents can contribute with goalId+amount.
	const contributedAt =
		asOptionalNumber(args.contributedAt) ??
		asOptionalNumber(args.date) ??
		Date.now();
	const fromAccountId = asOptionalId<"accounts">(args.fromAccountId);
	const notes = validateCreditNotes(asOptionalString(args.notes));

	const goal = await requireSavingsGoalOwnership(ctx, userId, goalId);
	if (goal.status === "paused") {
		throw new AgentGatewayError("conflict", "Savings goal is paused");
	}

	let transactionId: Id<"transactions"> | undefined;
	if (goal.accountId) {
		if (!fromAccountId) {
			throw new AgentGatewayError(
				"validation",
				"fromAccountId is required for goals linked to an account",
			);
		}
		transactionId = await insertSavingsGoalTransferTransaction(ctx, userId, {
			fromAccountId,
			toAccountId: goal.accountId,
			amount,
			date: contributedAt,
			notes: notes?.trim() || `Aporte manual — meta «${goal.name}»`,
		});
	}

	const now = Date.now();
	const contributionId = await ctx.db.insert("savingsContributions", {
		goalId,
		amount,
		contributedAt,
		transactionId,
		notes,
		createdAt: now,
	});

	const newAmount = goal.currentAmount + amount;
	const completed = newAmount >= goal.targetAmount;
	await ctx.db.patch(goalId, {
		currentAmount: newAmount,
		status: completed ? "completed" : goal.status,
		updatedAt: now,
	});

	return { contributionId, currentAmount: newAmount };
}

async function toolCreateTaxItem(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const documentId = asId<"taxDocuments">(args.documentId, "documentId");
	const section = asTaxSection(args.section);
	const category = asString(args.category, "category");
	// MCP historically used `concept`; domain field is `description`.
	const descriptionRaw = args.description ?? args.concept;
	const description = validateTaxItemDescription(
		asString(descriptionRaw, args.description !== undefined ? "description" : "concept"),
	);
	const amount = validatePositiveCopAmount(asNumber(args.amount, "amount"));
	const notes = validateTaxItemNotes(asOptionalString(args.notes));

	await assertTaxDocumentEditable(ctx, userId, documentId);
	assertTaxCategory(section, category);

	const now = Date.now();
	const itemId = await ctx.db.insert("taxItems", {
		userId,
		documentId,
		section,
		category,
		description,
		amount,
		notes,
		createdAt: now,
		updatedAt: now,
	});
	return { itemId };
}

async function toolUpdateTaxItem(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const itemId = asId<"taxItems">(args.itemId, "itemId");
	const item = await requireTaxItemOwnership(ctx, userId, itemId);
	await assertTaxDocumentEditable(ctx, userId, item.documentId);

	const section =
		args.section !== undefined ? asTaxSection(args.section) : item.section;
	const category =
		args.category !== undefined
			? asString(args.category, "category")
			: item.category;
	assertTaxCategory(section, category);

	const patch: Record<string, unknown> = {
		section,
		category,
		updatedAt: Date.now(),
	};
	const descriptionRaw =
		args.description !== undefined
			? args.description
			: args.concept !== undefined
				? args.concept
				: undefined;
	if (descriptionRaw !== undefined) {
		patch.description = validateTaxItemDescription(
			asString(
				descriptionRaw,
				args.description !== undefined ? "description" : "concept",
			),
		);
	}
	if (args.amount !== undefined) {
		patch.amount = validatePositiveCopAmount(asNumber(args.amount, "amount"));
	}
	if (args.notes !== undefined) {
		patch.notes = validateTaxItemNotes(asOptionalString(args.notes));
	}

	await ctx.db.patch(itemId, patch);
	return { itemId };
}

async function toolDeleteTransaction(
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) {
	const transactionId = asId<"transactions">(
		args.transactionId,
		"transactionId",
	);
	await removeTransactionForUser(ctx, userId, transactionId);
	return { transactionId };
}

// ---------------------------------------------------------------------------
// Tool registry: scopes, confirmation requirements and dispatch table.
// ---------------------------------------------------------------------------

type ToolHandler = (
	ctx: MutationCtx,
	userId: Id<"users">,
	args: Record<string, unknown>,
) => Promise<unknown>;

type ToolDefinition = {
	scopes: ApiScope[];
	/** "all" (default) requires every scope; "any" requires at least one. */
	scopeMode?: "all" | "any";
	destructive?: boolean;
	handler: ToolHandler;
};

const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
	get_financial_overview: {
		scopes: ["read:dashboard"],
		handler: toolGetFinancialOverview,
	},
	list_transactions: {
		scopes: ["read:transactions"],
		handler: toolListTransactions,
	},
	get_spending_summary: {
		scopes: ["read:dashboard", "read:transactions"],
		scopeMode: "any",
		handler: toolGetSpendingSummary,
	},
	list_accounts: {
		scopes: ["read:accounts"],
		handler: toolListAccounts,
	},
	list_categories: {
		scopes: ["read:categories"],
		handler: toolListCategories,
	},
	list_budgets: {
		scopes: ["read:budgets"],
		handler: toolListBudgets,
	},
	list_fixed_expenses: {
		scopes: ["read:budgets"],
		handler: toolListFixedExpenses,
	},
	list_credits: {
		scopes: ["read:credits"],
		handler: toolListCredits,
	},
	list_savings_goals: {
		scopes: ["read:savings"],
		handler: (ctx, userId) => toolListSavingsGoals(ctx, userId),
	},
	list_tax_documents: {
		scopes: ["read:tax"],
		handler: (ctx, userId) => toolListTaxDocuments(ctx, userId),
	},
	get_tax_document: {
		scopes: ["read:tax"],
		handler: toolGetTaxDocument,
	},
	create_transaction: {
		scopes: ["write:transactions"],
		handler: toolCreateTransaction,
	},
	update_transaction: {
		scopes: ["write:transactions"],
		handler: toolUpdateTransaction,
	},
	upsert_budget: {
		scopes: ["write:budgets"],
		handler: toolUpsertBudget,
	},
	create_savings_goal: {
		scopes: ["write:savings"],
		handler: toolCreateSavingsGoal,
	},
	contribute_to_goal: {
		scopes: ["write:savings"],
		handler: toolContributeToGoal,
	},
	create_tax_item: {
		scopes: ["write:tax"],
		handler: toolCreateTaxItem,
	},
	update_tax_item: {
		scopes: ["write:tax"],
		handler: toolUpdateTaxItem,
	},
	delete_transaction: {
		scopes: ["write:transactions", "destructive"],
		destructive: true,
		handler: toolDeleteTransaction,
	},
};

export function getToolRequiredScopes(tool: string): ApiScope[] {
	return TOOL_DEFINITIONS[tool]?.scopes ?? [];
}

// ---------------------------------------------------------------------------
// Dispatch core
// ---------------------------------------------------------------------------

function toGatewayError(error: unknown): AgentGatewayError {
	if (error instanceof AgentGatewayError) return error;
	const message = error instanceof Error ? error.message : "Unexpected error";
	if (/not found/i.test(message)) {
		return new AgentGatewayError("not_found", message);
	}
	if (/filed/i.test(message)) {
		return new AgentGatewayError("conflict", message);
	}
	return new AgentGatewayError("validation", message);
}

function summarizeArgs(args: unknown): string | undefined {
	try {
		const json = JSON.stringify(args ?? {});
		return json.length > 500 ? `${json.slice(0, 497)}...` : json;
	} catch {
		return undefined;
	}
}

export type DispatchParams = {
	userId: Id<"users">;
	tokenId: Id<"apiTokens">;
	scopes: string[];
	tool: string;
	args: unknown;
	confirm?: boolean;
};

async function dispatchTool(
	ctx: MutationCtx,
	params: DispatchParams,
): Promise<unknown> {
	const { userId, tokenId, scopes, tool, args, confirm } = params;
	let success = false;
	let errorCode: string | undefined;

	try {
		const definition = TOOL_DEFINITIONS[tool];
		if (!definition) {
			throw new AgentGatewayError("validation", `Unknown tool: ${tool}`);
		}

		if (definition.scopeMode === "any") {
			if (!hasAnyScope(scopes, definition.scopes)) {
				throw new AgentGatewayError(
					"forbidden",
					`Missing one of required scope(s): ${definition.scopes.join(", ")}`,
				);
			}
		} else {
			assertScopes(scopes, definition.scopes);
		}

		if (definition.destructive && confirm !== true) {
			throw new AgentGatewayError(
				"confirmation_required",
				"This action is destructive and requires confirm: true",
			);
		}

		const normalizedArgs = (
			args && typeof args === "object" ? args : {}
		) as Record<string, unknown>;
		const data = await definition.handler(ctx, userId, normalizedArgs);
		success = true;
		return data;
	} catch (error) {
		const gatewayError = toGatewayError(error);
		errorCode = gatewayError.code;
		throw gatewayError;
	} finally {
		await recordAudit(ctx, {
			userId,
			tokenId,
			action: tool,
			success,
			errorCode,
			summary: summarizeArgs(args),
		});
	}
}

export type AgentGatewayResult =
	| { ok: true; tool: string; data: unknown }
	| { ok: false; error: { code: AgentGatewayErrorCode; message: string } };

async function assertAgentRateLimit(
	ctx: MutationCtx,
	tokenId: Id<"apiTokens">,
): Promise<void> {
	const now = Date.now();
	const existing = await ctx.db
		.query("agentRateLimits")
		.withIndex("by_token", (q) => q.eq("tokenId", tokenId))
		.unique();

	if (!existing || now - existing.windowStart >= AGENT_RATE_LIMIT_WINDOW_MS) {
		if (existing) {
			await ctx.db.patch(existing._id, { windowStart: now, count: 1 });
		} else {
			await ctx.db.insert("agentRateLimits", {
				tokenId,
				windowStart: now,
				count: 1,
			});
		}
		return;
	}

	if (existing.count >= AGENT_RATE_LIMIT_MAX) {
		throw new AgentGatewayError(
			"rate_limited",
			`Rate limit exceeded (${AGENT_RATE_LIMIT_MAX} requests per minute)`,
		);
	}

	await ctx.db.patch(existing._id, { count: existing.count + 1 });
}

async function runDispatch(
	ctx: MutationCtx,
	params: DispatchParams,
): Promise<AgentGatewayResult> {
	try {
		const data = await dispatchTool(ctx, params);
		return { ok: true, tool: params.tool, data };
	} catch (error) {
		const gatewayError = toGatewayError(error);
		return {
			ok: false,
			error: { code: gatewayError.code, message: gatewayError.message },
		};
	}
}

export const dispatch = internalMutation({
	args: {
		userId: v.id("users"),
		tokenId: v.id("apiTokens"),
		scopes: v.array(v.string()),
		tool: v.string(),
		args: v.any(),
		confirm: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<AgentGatewayResult> => {
		return runDispatch(ctx, args);
	},
});

export const authenticateAndDispatch = internalMutation({
	args: {
		tokenHash: v.string(),
		tool: v.string(),
		args: v.any(),
		confirm: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ tokenHash, tool, args, confirm },
	): Promise<AgentGatewayResult> => {
		let auth: AuthenticatedApiToken;
		try {
			auth = await authenticateApiTokenByHash(ctx, tokenHash);
			await assertAgentRateLimit(ctx, auth.tokenId);
		} catch (error) {
			const gatewayError = toGatewayError(error);
			return {
				ok: false,
				error: { code: gatewayError.code, message: gatewayError.message },
			};
		}

		return runDispatch(ctx, {
			userId: auth.userId,
			tokenId: auth.tokenId,
			scopes: auth.scopes,
			tool,
			args,
			confirm,
		});
	},
});
