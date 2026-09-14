import { v } from "convex/values";

export const accountTypeValidator = v.union(
	v.literal("cash"),
	v.literal("bank"),
	v.literal("credit"),
);

export const categoryTypeValidator = v.union(
	v.literal("expense"),
	v.literal("income"),
	v.literal("transfer"),
);

export const transactionTypeValidator = v.union(
	v.literal("income"),
	v.literal("expense"),
	v.literal("transfer"),
);

export const mimeTypeValidator = v.union(
	v.literal("image/jpeg"),
	v.literal("image/png"),
	v.literal("application/pdf"),
);

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TRANSACTION = 5;
export const MAX_ATTACHMENTS_PER_TAX_ITEM = 5;
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const MAX_TRANSACTION_NOTES_LENGTH = 2000;
export const MAX_ATTACHMENT_FILENAME_LENGTH = 255;
export const MAX_PENDING_UPLOADS_PER_USER = 30;
export const PENDING_UPLOAD_TTL_MS = 48 * 60 * 60 * 1000;
export const DEFAULT_API_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const AGENT_RATE_LIMIT_WINDOW_MS = 60_000;
export const AGENT_RATE_LIMIT_MAX = 60;

const AVATAR_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

export function validateNonEmptyName(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length === 0) {
		throw new Error("Name is required");
	}
	return trimmed;
}

export function validateCopAmount(amount: number, field = "amount"): number {
	if (!Number.isInteger(amount)) {
		throw new Error(`${field} must be an integer`);
	}
	if (amount < 0) {
		throw new Error(`${field} cannot be negative`);
	}
	return amount;
}

export function validatePositiveCopAmount(amount: number): number {
	if (!Number.isInteger(amount)) {
		throw new Error("Amount must be an integer");
	}
	if (amount <= 0) {
		throw new Error("Amount must be greater than zero");
	}
	return amount;
}

export function validateMimeType(
	mimeType: string,
): "image/jpeg" | "image/png" | "application/pdf" {
	if (
		mimeType !== "image/jpeg" &&
		mimeType !== "image/png" &&
		mimeType !== "application/pdf"
	) {
		throw new Error("File type not allowed");
	}
	return mimeType;
}

export function validateTransactionNotes(notes?: string): string | undefined {
	if (!notes?.trim()) return undefined;
	const trimmed = notes.trim();
	if (trimmed.length > MAX_TRANSACTION_NOTES_LENGTH) {
		throw new Error(
			`Notes must be at most ${MAX_TRANSACTION_NOTES_LENGTH} characters`,
		);
	}
	return trimmed;
}

/** Basename-only filename; strips path segments and control chars. */
export function sanitizeAttachmentFilename(filename: string): string {
	const raw = filename.trim() || "archivo";
	const base = raw.split(/[/\\]/).pop()?.trim() || "archivo";
	const cleaned = base
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.replace(/^\.+/, "")
		.slice(0, MAX_ATTACHMENT_FILENAME_LENGTH);
	return cleaned || "archivo";
}

export function validateDisplayName(name: string): string {
	const trimmed = validateNonEmptyName(name);
	if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
		throw new Error("Name must be at most 80 characters");
	}
	return trimmed;
}

export function validateAvatarMimeType(mimeType: string): AvatarMimeType {
	if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
		throw new Error("Only JPEG and PNG images are allowed");
	}
	return mimeType;
}

export function validateAvatarSize(size: number): void {
	if (size > MAX_AVATAR_SIZE) {
		throw new Error("Image exceeds 2 MB limit");
	}
}

export const MAX_BUDGET_NOTES_LENGTH = 200;
export const MAX_FIXED_EXPENSE_NAME_LENGTH = 80;
export const MAX_REMINDER_OFFSETS = 5;

const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validatePeriodKey(periodKey: string): string {
	if (!PERIOD_KEY_RE.test(periodKey)) {
		throw new Error("Invalid period key");
	}
	return periodKey;
}

export function validateDayOfMonth(day: number): number {
	if (!Number.isInteger(day) || day < 1 || day > 31) {
		throw new Error("Day of month must be between 1 and 31");
	}
	return day;
}

export function validateReminderOffsets(offsets: number[]): number[] {
	if (offsets.length === 0 || offsets.length > MAX_REMINDER_OFFSETS) {
		throw new Error("Reminder offsets must have 1 to 5 entries");
	}
	const unique = new Set<number>();
	for (const offset of offsets) {
		if (!Number.isInteger(offset) || offset < 0 || offset > 30) {
			throw new Error("Each reminder offset must be 0–30 days");
		}
		if (unique.has(offset)) {
			throw new Error("Duplicate reminder offsets");
		}
		unique.add(offset);
	}
	return [...offsets].sort((a, b) => b - a);
}

export const MAX_CREDIT_NAME_LENGTH = 80;
export const MAX_CREDIT_NOTES_LENGTH = 500;
export const MAX_DESTINATION_NAME_LENGTH = 80;

export const rateTypeValidator = v.union(
	v.literal("EA"),
	v.literal("NAMV"),
	v.literal("MV"),
);

export const scheduleModeValidator = v.union(
	v.literal("cuota_fija"),
	v.literal("capital_constant"),
	v.literal("manual"),
);

export const abonoRecalcEffectValidator = v.union(
	v.literal("shorten_term"),
	v.literal("lower_installment"),
);

export const creditStatusValidator = v.union(
	v.literal("active"),
	v.literal("paid_off"),
	v.literal("defaulted"),
);

export const creditProfileValidator = v.union(
	v.literal("free_purpose"),
	v.literal("housing_improvement"),
	v.literal("debt_consolidation"),
	v.literal("tangible_product"),
	v.literal("intangible_service"),
	v.literal("p2p_agreement"),
);

export const setupStatusValidator = v.union(
	v.literal("draft"),
	v.literal("ready"),
	v.literal("active"),
);

export const linkedAssetValidator = v.object({
	kind: v.union(
		v.literal("vehicle"),
		v.literal("goods"),
		v.literal("service"),
		v.literal("other"),
	),
	label: v.string(),
	vendor: v.optional(v.string()),
	identifier: v.optional(v.string()),
});

export const informalAgreementValidator = v.object({
	counterpartyName: v.optional(v.string()),
	relationship: v.optional(v.string()),
	notes: v.optional(v.string()),
});

export const creditPaymentStatusValidator = v.union(
	v.literal("pending"),
	v.literal("paid"),
	v.literal("overdue"),
	v.literal("cancelled"),
);

export const destinationStatusValidator = v.union(
	v.literal("planned"),
	v.literal("in_progress"),
	v.literal("completed"),
);

export const savingsGoalStatusValidator = v.union(
	v.literal("active"),
	v.literal("completed"),
	v.literal("paused"),
);

export const savingsGoalSnapshotValidator = v.object({
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
	contributions: v.array(
		v.object({
			amount: v.number(),
			contributedAt: v.number(),
			transactionId: v.optional(v.id("transactions")),
			sourceTransactionId: v.optional(v.id("transactions")),
			notes: v.optional(v.string()),
			createdAt: v.number(),
		}),
	),
});

export function validateCreditName(name: string): string {
	const trimmed = validateNonEmptyName(name);
	if (trimmed.length > MAX_CREDIT_NAME_LENGTH) {
		throw new Error("Name must be at most 80 characters");
	}
	return trimmed;
}

export function validateCreditNotes(notes?: string): string | undefined {
	if (!notes?.trim()) return undefined;
	const trimmed = notes.trim();
	if (trimmed.length > MAX_CREDIT_NOTES_LENGTH) {
		throw new Error("Notes must be at most 500 characters");
	}
	return trimmed;
}

export function validateOptionalCreditLender(lender?: string): string {
	if (!lender?.trim()) return "";
	const trimmed = lender.trim();
	if (trimmed.length > MAX_CREDIT_NAME_LENGTH) {
		throw new Error("Lender name must be at most 80 characters");
	}
	return trimmed;
}

export function validateInterestRate(rate: number): number {
	if (typeof rate !== "number" || rate < 0 || rate > 100) {
		throw new Error("Interest rate must be between 0 and 100");
	}
	return rate;
}

export function validateTermMonths(term: number): number {
	if (!Number.isInteger(term) || term < 1 || term > 600) {
		throw new Error("Term must be between 1 and 600 months");
	}
	return term;
}

export function validatePaidInstallmentsCount(
	paid: number,
	termMonths: number,
): number {
	if (!Number.isInteger(paid) || paid < 0) {
		throw new Error("Las cuotas pagadas deben ser un número entero mayor o igual a 0");
	}
	if (paid >= termMonths) {
		throw new Error(
			"Las cuotas ya pagadas deben ser menores que el plazo total del crédito",
		);
	}
	return paid;
}

export const taxSectionValidator = v.union(
	v.literal("assets"),
	v.literal("liabilities"),
	v.literal("income"),
	v.literal("deductions"),
	v.literal("exempt"),
);

export const taxStatusValidator = v.union(
	v.literal("draft"),
	v.literal("review"),
	v.literal("filed"),
);

export const taxSourceTypeValidator = v.union(
	v.literal("account"),
	v.literal("credit"),
	v.literal("income_category"),
	v.literal("expense_category"),
	v.literal("credit_interest"),
);

export const MAX_TAX_ITEM_DESCRIPTION = 200;
export const MAX_TAX_ITEM_NOTES = 500;
export const MAX_TAX_DOCUMENT_NOTES = 1000;

export function validateTaxYear(taxYear: number): number {
	const maxYear = new Date().getFullYear() + 1;
	if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > maxYear) {
		throw new Error("TAX_YEAR_INVALID");
	}
	return taxYear;
}

export function validateTaxItemDescription(description: string): string {
	const trimmed = validateNonEmptyName(description);
	if (trimmed.length > MAX_TAX_ITEM_DESCRIPTION) {
		throw new Error("Description must be at most 200 characters");
	}
	return trimmed;
}

export function validateTaxItemNotes(notes?: string): string | undefined {
	if (!notes?.trim()) return undefined;
	const trimmed = notes.trim();
	if (trimmed.length > MAX_TAX_ITEM_NOTES) {
		throw new Error("Notes must be at most 500 characters");
	}
	return trimmed;
}

export function validateTaxDocumentNotes(notes?: string): string | undefined {
	if (!notes?.trim()) return undefined;
	const trimmed = notes.trim();
	if (trimmed.length > MAX_TAX_DOCUMENT_NOTES) {
		throw new Error("Notes must be at most 1000 characters");
	}
	return trimmed;
}

export const apiScopeValidator = v.union(
	v.literal("read:dashboard"),
	v.literal("read:transactions"),
	v.literal("write:transactions"),
	v.literal("read:accounts"),
	v.literal("write:accounts"),
	v.literal("read:categories"),
	v.literal("write:categories"),
	v.literal("read:budgets"),
	v.literal("write:budgets"),
	v.literal("read:credits"),
	v.literal("write:credits"),
	v.literal("read:savings"),
	v.literal("write:savings"),
	v.literal("read:tax"),
	v.literal("write:tax"),
	v.literal("destructive"),
);

export function validateOptionalEstimatedAmount(
	value: number | null | undefined,
	field: string,
): number | undefined {
	if (value === null || value === undefined) return undefined;
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${field} must be a non-negative integer`);
	}
	return value;
}
