import { describe, expect, test } from "bun:test";
import {
	type InstallmentCandidate,
	pickInstallmentForPeriod,
	shouldAdvancePaidPeriod,
} from "./creditFixedExpenseSync";

function due(isoDate: string): number {
	const [y, m, d] = isoDate.split("-").map(Number);
	return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

function installment(
	overrides: Partial<InstallmentCandidate> & { installmentNumber: number },
): InstallmentCandidate {
	return {
		status: "pending",
		dueDate: due("2026-10-15"),
		totalDue: 500_000,
		...overrides,
	};
}

describe("pickInstallmentForPeriod", () => {
	test("returns the unpaid installment due in the requested month", () => {
		const payments = [
			installment({ installmentNumber: 1, status: "paid", dueDate: due("2026-09-15") }),
			installment({ installmentNumber: 2, dueDate: due("2026-10-15") }),
			installment({ installmentNumber: 3, dueDate: due("2026-11-15") }),
		];
		expect(pickInstallmentForPeriod(payments, "2026-10")?.installmentNumber).toBe(2);
	});

	test("treats overdue installments as unpaid", () => {
		const payments = [
			installment({ installmentNumber: 2, status: "overdue", dueDate: due("2026-10-15") }),
		];
		expect(pickInstallmentForPeriod(payments, "2026-10")?.installmentNumber).toBe(2);
	});

	test("falls back to the earliest unpaid installment when none is due that month", () => {
		const payments = [
			installment({ installmentNumber: 4, dueDate: due("2026-12-15") }),
			installment({ installmentNumber: 3, dueDate: due("2026-11-15") }),
		];
		expect(pickInstallmentForPeriod(payments, "2026-10")?.installmentNumber).toBe(3);
	});

	test("ignores paid, cancelled and zero-amount rows", () => {
		const payments = [
			installment({ installmentNumber: 1, status: "paid" }),
			installment({ installmentNumber: 2, status: "cancelled" }),
			installment({ installmentNumber: 3, totalDue: 0 }),
		];
		expect(pickInstallmentForPeriod(payments, "2026-10")).toBeNull();
	});
});

describe("shouldAdvancePaidPeriod", () => {
	test("advances when nothing was paid before", () => {
		expect(shouldAdvancePaidPeriod(undefined, "2026-10")).toBe(true);
	});

	test("advances to a later or equal month", () => {
		expect(shouldAdvancePaidPeriod("2026-09", "2026-10")).toBe(true);
		expect(shouldAdvancePaidPeriod("2026-10", "2026-10")).toBe(true);
	});

	test("does not regress when paying an older overdue installment", () => {
		expect(shouldAdvancePaidPeriod("2026-10", "2026-09")).toBe(false);
	});
});
