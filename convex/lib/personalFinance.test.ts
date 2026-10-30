import { describe, expect, it } from "bun:test";
import type { Doc, Id } from "../_generated/dataModel";
import {
	countsForPersonalFinance,
	isAccountExcludedFromPersonalFinance,
	personalFinanceExpenseAmount,
	transferToIsolatedCountsAsExpense,
	visibleInMovementsHistory,
} from "./personalFinance";

function account(
	overrides: Partial<
		Pick<Doc<"accounts">, "excludeFromPersonalFinance" | "isCreditEscrow">
	>,
) {
	return {
		excludeFromPersonalFinance: overrides.excludeFromPersonalFinance,
		isCreditEscrow: overrides.isCreditEscrow,
	};
}

function tx(
	overrides: Partial<
		Pick<
			Doc<"transactions">,
			| "type"
			| "accountId"
			| "toAccountId"
			| "amount"
			| "isCreditFundMovement"
			| "isCreditInstallmentPayment"
		>
	>,
): Doc<"transactions"> {
	return {
		_id: "tx1" as Id<"transactions">,
		_creationTime: 0,
		userId: "u1" as Id<"users">,
		type: overrides.type ?? "expense",
		amount: overrides.amount ?? 1000,
		date: 0,
		accountId: (overrides.accountId ?? "acc1") as Id<"accounts">,
		toAccountId: overrides.toAccountId,
		categoryId: "cat1" as Id<"categories">,
		isCreditFundMovement: overrides.isCreditFundMovement,
		isCreditInstallmentPayment: overrides.isCreditInstallmentPayment,
		createdAt: 0,
		updatedAt: 0,
	};
}

describe("isAccountExcludedFromPersonalFinance", () => {
	it("honors explicit exclude flag", () => {
		expect(
			isAccountExcludedFromPersonalFinance(
				account({ excludeFromPersonalFinance: true }),
			),
		).toBe(true);
		expect(
			isAccountExcludedFromPersonalFinance(
				account({ excludeFromPersonalFinance: false, isCreditEscrow: true }),
			),
		).toBe(false);
	});

	it("falls back to escrow when flag is unset", () => {
		expect(
			isAccountExcludedFromPersonalFinance(account({ isCreditEscrow: true })),
		).toBe(true);
		expect(isAccountExcludedFromPersonalFinance(account({}))).toBe(false);
	});
});

describe("countsForPersonalFinance", () => {
	const excluded = new Set<Id<"accounts">>(["escrow" as Id<"accounts">]);

	it("always counts installment payments", () => {
		expect(
			countsForPersonalFinance(
				tx({
					accountId: "escrow" as Id<"accounts">,
					isCreditInstallmentPayment: true,
				}),
				excluded,
			),
		).toBe(true);
	});

	it("excludes fund movements and isolated accounts", () => {
		expect(
			countsForPersonalFinance(tx({ isCreditFundMovement: true }), excluded),
		).toBe(false);
		expect(
			countsForPersonalFinance(
				tx({ accountId: "escrow" as Id<"accounts"> }),
				excluded,
			),
		).toBe(false);
		expect(
			countsForPersonalFinance(
				tx({ accountId: "payroll" as Id<"accounts"> }),
				excluded,
			),
		).toBe(true);
	});
});

describe("transferToIsolatedCountsAsExpense", () => {
	const excluded = new Set<Id<"accounts">>(["meta" as Id<"accounts">]);

	it("counts personal → isolated transfer as expense", () => {
		expect(
			transferToIsolatedCountsAsExpense(
				tx({
					type: "transfer",
					accountId: "payroll" as Id<"accounts">,
					toAccountId: "meta" as Id<"accounts">,
					amount: 500_000,
				}),
				excluded,
			),
		).toBe(true);
		expect(
			personalFinanceExpenseAmount(
				tx({
					type: "transfer",
					accountId: "payroll" as Id<"accounts">,
					toAccountId: "meta" as Id<"accounts">,
					amount: 500_000,
				}),
				excluded,
			),
		).toBe(500_000);
	});

	it("ignores internal and reverse transfers", () => {
		expect(
			transferToIsolatedCountsAsExpense(
				tx({
					type: "transfer",
					accountId: "payroll" as Id<"accounts">,
					toAccountId: "cash" as Id<"accounts">,
				}),
				excluded,
			),
		).toBe(false);
		expect(
			transferToIsolatedCountsAsExpense(
				tx({
					type: "transfer",
					accountId: "meta" as Id<"accounts">,
					toAccountId: "payroll" as Id<"accounts">,
				}),
				excluded,
			),
		).toBe(false);
	});
});

describe("visibleInMovementsHistory", () => {
	const excluded = new Set<Id<"accounts">>(["isolated" as Id<"accounts">]);

	it("shows expenses from excluded accounts so they can be edited", () => {
		expect(
			visibleInMovementsHistory(
				tx({ accountId: "isolated" as Id<"accounts"> }),
				excluded,
				{ includeExcludedAccounts: true },
			),
		).toBe(true);
	});

	it("keeps excluded accounts out when not requested (reports)", () => {
		expect(
			visibleInMovementsHistory(
				tx({ accountId: "isolated" as Id<"accounts"> }),
				excluded,
				{ includeExcludedAccounts: false },
			),
		).toBe(false);
	});

	it("still hides credit escrow fund movements", () => {
		expect(
			visibleInMovementsHistory(tx({ isCreditFundMovement: true }), excluded, {
				includeExcludedAccounts: true,
			}),
		).toBe(false);
	});

	it("shows regular personal movements", () => {
		expect(
			visibleInMovementsHistory(tx({}), excluded, {
				includeExcludedAccounts: false,
			}),
		).toBe(true);
	});
});
