import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	accentPresetValidator,
	dangerPresetValidator,
	groupingValidator,
	languageValidator,
	themeValidator,
	typographyPresetValidator,
} from "./lib/preferences";
import {
	abonoRecalcEffectValidator,
	apiScopeValidator,
	creditPaymentStatusValidator,
	creditProfileValidator,
	creditStatusValidator,
	destinationStatusValidator,
	informalAgreementValidator,
	linkedAssetValidator,
	rateTypeValidator,
	savingsGoalStatusValidator,
	savingsGoalSnapshotValidator,
	scheduleModeValidator,
	setupStatusValidator,
	taxSectionValidator,
	taxSourceTypeValidator,
	taxStatusValidator,
} from "./lib/validators";

const accountTypeValidator = v.union(
	v.literal("cash"),
	v.literal("bank"),
	v.literal("credit"),
);

const categoryTypeValidator = v.union(
	v.literal("expense"),
	v.literal("income"),
	v.literal("transfer"),
);

const transactionTypeValidator = v.union(
	v.literal("income"),
	v.literal("expense"),
	v.literal("transfer"),
);

const mimeTypeValidator = v.union(
	v.literal("image/jpeg"),
	v.literal("image/png"),
	v.literal("application/pdf"),
);

export default defineSchema({
	...authTables,

	userProfiles: defineTable({
		userId: v.id("users"),
		googleSub: v.string(),
		displayName: v.optional(v.string()),
		avatarStorageId: v.optional(v.id("_storage")),
		profileUpdatedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_googleSub", ["googleSub"]),

	userPreferences: defineTable({
		userId: v.id("users"),
		theme: themeValidator,
		accentPreset: v.optional(accentPresetValidator),
		dangerPreset: v.optional(dangerPresetValidator),
		typographyPreset: v.optional(typographyPresetValidator),
		defaultGrouping: v.optional(groupingValidator),
		language: v.optional(languageValidator),
		notificationsEnabled: v.optional(v.boolean()),
		reportEmailEnabled: v.optional(v.boolean()),
		pushEnabled: v.optional(v.boolean()),
		updatedAt: v.number(),
	}).index("by_user", ["userId"]),

	categories: defineTable({
		userId: v.id("users"),
		name: v.string(),
		icon: v.string(),
		color: v.string(),
		type: categoryTypeValidator,
		archived: v.optional(v.boolean()),
		isSystem: v.optional(v.boolean()),
		linkedCreditId: v.optional(v.id("credits")),
		linkedCreditPurpose: v.optional(
			v.union(
				v.literal("payment"),
				v.literal("fund_expense"),
				v.literal("disbursement_income"),
			),
		),
		/** Si true, la categoría se elimina al borrar el crédito vinculado */
		linkedCreditAutoDelete: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
		archivedAt: v.optional(v.number()),
	})
		.index("by_user", ["userId"])
		.index("by_user_type", ["userId", "type"])
		.index("by_user_type_archived", ["userId", "type", "archived"])
		.index("by_linked_credit", ["linkedCreditId"]),

	accounts: defineTable({
		userId: v.id("users"),
		name: v.string(),
		type: accountTypeValidator,
		initialBalance: v.number(),
		balance: v.number(),
		archived: v.boolean(),
		isCreditEscrow: v.optional(v.boolean()),
		/** Excluir saldo e ingresos/gastos/neto del mes de las finanzas personales. */
		excludeFromPersonalFinance: v.optional(v.boolean()),
		sortOrder: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
		archivedAt: v.optional(v.number()),
	})
		.index("by_user", ["userId"])
		.index("by_user_archived", ["userId", "archived"]),

	transactions: defineTable({
		userId: v.id("users"),
		type: transactionTypeValidator,
		amount: v.number(),
		date: v.number(),
		accountId: v.id("accounts"),
		toAccountId: v.optional(v.id("accounts")),
		categoryId: v.id("categories"),
		notes: v.optional(v.string()),
		sourceFixedExpenseId: v.optional(v.id("fixedExpenses")),
		creditId: v.optional(v.id("credits")),
		creditDestinationId: v.optional(v.id("creditDestinations")),
		isCreditFundMovement: v.optional(v.boolean()),
		/** Pago de cuota: siempre cuenta en finanzas personales aunque la cuenta esté aislada. */
		isCreditInstallmentPayment: v.optional(v.boolean()),
		sortOrder: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_date", ["userId", "date"])
		.index("by_user_account", ["userId", "accountId"])
		.index("by_user_category", ["userId", "categoryId"]),

	attachments: defineTable({
		userId: v.id("users"),
		entityType: v.union(v.literal("transaction"), v.literal("taxItem")),
		entityId: v.string(),
		storageId: v.id("_storage"),
		filename: v.string(),
		mimeType: mimeTypeValidator,
		size: v.number(),
		uploadedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_entity", ["entityType", "entityId"])
		.index("by_storage", ["storageId"]),

	budgets: defineTable({
		userId: v.id("users"),
		categoryIds: v.array(v.id("categories")),
		amount: v.number(),
		periodKey: v.string(),
		notes: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_period", ["userId", "periodKey"]),

	fixedExpenses: defineTable({
		userId: v.id("users"),
		name: v.string(),
		amount: v.number(),
		categoryId: v.id("categories"),
		dayOfMonth: v.number(),
		reminderOffsets: v.array(v.number()),
		emailReminders: v.boolean(),
		pushReminders: v.boolean(),
		active: v.boolean(),
		lastPaidPeriodKey: v.optional(v.string()),
		lastPaidTransactionId: v.optional(v.id("transactions")),
		linkedSavingsGoalId: v.optional(v.id("savingsGoals")),
		linkedCreditId: v.optional(v.id("credits")),
		onlyPeriodKey: v.optional(v.string()),
		/** When set to current YYYY-MM, exclude from pending + reminders for that month. */
		skippedPeriodKey: v.optional(v.string()),
		notes: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_active", ["userId", "active"])
		.index("by_paid_transaction", ["lastPaidTransactionId"])
		.index("by_linked_credit", ["linkedCreditId"]),

	pushSubscriptions: defineTable({
		userId: v.id("users"),
		endpoint: v.string(),
		p256dh: v.string(),
		auth: v.string(),
		userAgent: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_endpoint", ["endpoint"]),

	notificationLog: defineTable({
		userId: v.id("users"),
		dedupeKey: v.string(),
		type: v.union(
			v.literal("fixed_expense_reminder"),
			v.literal("fixed_expense_overdue"),
			v.literal("budget_threshold"),
			v.literal("period_report"),
			v.literal("credit_due"),
		),
		referenceId: v.string(),
		channel: v.union(
			v.literal("email"),
			v.literal("push"),
			v.literal("in_app"),
		),
		sentAt: v.number(),
	})
		.index("by_dedupeKey", ["dedupeKey"])
		.index("by_user_sent", ["userId", "sentAt"]),

	credits: defineTable({
		userId: v.id("users"),
		name: v.string(),
		creditProfile: v.optional(creditProfileValidator),
		setupStatus: v.optional(setupStatusValidator),
		lender: v.string(),
		principal: v.number(),
		rateType: rateTypeValidator,
		interestRate: v.number(),
		termMonths: v.number(),
		startDate: v.number(),
		paymentDay: v.number(),
		scheduleMode: scheduleModeValidator,
		fixedInstallment: v.optional(v.number()),
		defaultRecalcOnAbono: abonoRecalcEffectValidator,
		targetPayoffDate: v.optional(v.number()),
		insuranceMonthly: v.optional(v.number()),
		disbursementAccountId: v.optional(v.id("accounts")),
		operatingAccountId: v.optional(v.id("accounts")),
		linkedAsset: v.optional(linkedAssetValidator),
		informalAgreement: v.optional(informalAgreementValidator),
		profileMetadata: v.optional(v.any()),
		paymentCategoryId: v.optional(v.id("categories")),
		linkedFixedExpenseId: v.optional(v.id("fixedExpenses")),
		fundExpenseCategoryIds: v.optional(v.array(v.id("categories"))),
		disbursementIncomeCategoryId: v.optional(v.id("categories")),
		disbursementTransactionId: v.optional(v.id("transactions")),
		outstandingBalance: v.number(),
		excludeFromPersonalFinance: v.optional(v.boolean()),
		reminderOffsets: v.array(v.number()),
		status: creditStatusValidator,
		notes: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_status", ["userId", "status"]),

	creditPayments: defineTable({
		creditId: v.id("credits"),
		installmentNumber: v.number(),
		dueDate: v.number(),
		paidDate: v.optional(v.number()),
		principal: v.number(),
		interest: v.number(),
		insuranceAmount: v.optional(v.number()),
		otherFees: v.optional(v.number()),
		totalDue: v.number(),
		status: creditPaymentStatusValidator,
		transactionId: v.optional(v.id("transactions")),
		isProjected: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_credit", ["creditId"])
		.index("by_credit_status", ["creditId", "status"])
		.index("by_credit_due", ["creditId", "dueDate"]),

	creditCapitalAbonos: defineTable({
		creditId: v.id("credits"),
		amount: v.number(),
		paidAt: v.number(),
		recalcEffect: abonoRecalcEffectValidator,
		transactionId: v.optional(v.id("transactions")),
		notes: v.optional(v.string()),
		savingsGoalSnapshot: v.optional(savingsGoalSnapshotValidator),
		createdAt: v.number(),
	})
		.index("by_credit", ["creditId"]),

	creditDestinations: defineTable({
		creditId: v.id("credits"),
		name: v.string(),
		amount: v.number(),
		spentAt: v.optional(v.number()),
		status: destinationStatusValidator,
		transactionIds: v.optional(v.array(v.id("transactions"))),
		notes: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_credit", ["creditId"]),

	savingsGoals: defineTable({
		userId: v.id("users"),
		name: v.string(),
		targetAmount: v.number(),
		currentAmount: v.number(),
		deadline: v.optional(v.number()),
		accountId: v.optional(v.id("accounts")),
		linkedCreditId: v.optional(v.id("credits")),
		linkedFixedExpenseId: v.optional(v.id("fixedExpenses")),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		status: savingsGoalStatusValidator,
		notes: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_status", ["userId", "status"])
		.index("by_linked_fixed_expense", ["linkedFixedExpenseId"]),

	savingsContributions: defineTable({
		goalId: v.id("savingsGoals"),
		amount: v.number(),
		contributedAt: v.number(),
		transactionId: v.optional(v.id("transactions")),
		sourceTransactionId: v.optional(v.id("transactions")),
		notes: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_goal", ["goalId"])
		.index("by_transaction", ["transactionId"])
		.index("by_source_transaction", ["sourceTransactionId"]),

	taxDocuments: defineTable({
		userId: v.id("users"),
		taxYear: v.number(),
		status: taxStatusValidator,
		estimatedTaxableIncome: v.optional(v.number()),
		estimatedTaxDue: v.optional(v.number()),
		notes: v.optional(v.string()),
		filedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_year", ["userId", "taxYear"]),

	taxItems: defineTable({
		userId: v.id("users"),
		documentId: v.id("taxDocuments"),
		section: taxSectionValidator,
		category: v.string(),
		description: v.string(),
		amount: v.number(),
		notes: v.optional(v.string()),
		sourceType: v.optional(taxSourceTypeValidator),
		sourceId: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_document", ["documentId"])
		.index("by_document_section", ["documentId", "section"])
		.index("by_user", ["userId"])
		.index("by_document_source", ["documentId", "sourceType", "sourceId"]),

	apiTokens: defineTable({
		userId: v.id("users"),
		name: v.string(),
		tokenPrefix: v.string(),
		tokenHash: v.string(),
		scopes: v.array(apiScopeValidator),
		expiresAt: v.optional(v.number()),
		lastUsedAt: v.optional(v.number()),
		revokedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_token_hash", ["tokenHash"])
		.index("by_user_created", ["userId", "createdAt"]),

	apiAuditLog: defineTable({
		userId: v.id("users"),
		tokenId: v.id("apiTokens"),
		action: v.string(),
		success: v.boolean(),
		errorCode: v.optional(v.string()),
		summary: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_user_created", ["userId", "createdAt"])
		.index("by_token_created", ["tokenId", "createdAt"]),

	agentRateLimits: defineTable({
		tokenId: v.id("apiTokens"),
		windowStart: v.number(),
		count: v.number(),
	}).index("by_token", ["tokenId"]),

	pendingUploads: defineTable({
		userId: v.id("users"),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_created", ["createdAt"]),
});
