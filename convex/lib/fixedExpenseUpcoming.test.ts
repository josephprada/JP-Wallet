import { describe, expect, test } from "bun:test";
import type { Doc, Id } from "../_generated/dataModel";
import {
	listUpcomingFixedExpensesForUser,
	periodKeysInRange,
} from "./fixedExpenseUpcoming";
import { periodKeyToMonthRange } from "./period";

// Convex runs in UTC; America/Bogota is UTC-5 (no DST).
const BOGOTA_SHIFT_MS = 5 * 60 * 60 * 1000;
const USER = "user_1" as Id<"users">;

/** Local-time timestamp (the helper uses local Date math; Convex runs in UTC). */
function localTs(year: number, monthIndex: number, day: number): number {
	return new Date(year, monthIndex, day).getTime();
}

function bogotaMonth(periodKey: string) {
	const { start, end } = periodKeyToMonthRange(periodKey);
	return { start: start + BOGOTA_SHIFT_MS, end: end + BOGOTA_SHIFT_MS };
}

let seq = 0;
function fixed(
	overrides: Partial<Doc<"fixedExpenses">> & { name: string; amount: number },
): Doc<"fixedExpenses"> {
	seq += 1;
	return {
		_id: `fixed_${seq}` as Id<"fixedExpenses">,
		_creationTime: 0,
		userId: USER,
		categoryId: "cat_1" as Id<"categories">,
		dayOfMonth: 1,
		reminderOffsets: [],
		emailReminders: false,
		pushReminders: false,
		active: true,
		createdAt: periodKeyToMonthRange("2026-08").start,
		updatedAt: 0,
		...overrides,
	};
}

/** Minimal in-memory stand-in for the Convex db reader used by the helper. */
function fakeCtx(
	fixedExpenses: Doc<"fixedExpenses">[],
	transactions: Doc<"transactions">[] = [],
) {
	const tables: Record<string, unknown[]> = { fixedExpenses, transactions };
	const db = {
		query: (table: string) => ({
			withIndex: (
				_index: string,
				build: (q: {
					eq: (field: string, value: unknown) => unknown;
				}) => unknown,
			) => {
				const filters: [string, unknown][] = [];
				const q = {
					eq: (field: string, value: unknown) => {
						filters.push([field, value]);
						return q;
					},
				};
				build(q);
				return {
					collect: async () =>
						(tables[table] ?? []).filter((row) =>
							filters.every(
								([field, value]) =>
									(row as Record<string, unknown>)[field] === value,
							),
						),
				};
			},
		}),
		get: async (id: string) => {
			if (id.startsWith("cat_")) return { _id: id, name: "Categoría test" };
			return (
				[...fixedExpenses, ...transactions].find((row) => row._id === id) ??
				null
			);
		},
	};
	// biome-ignore lint/suspicious/noExplicitAny: test double for Convex db
	return { db } as any;
}

describe("periodKeysInRange", () => {
	test("Bogota month touches its UTC month and the trailing sliver", () => {
		const { start, end } = bogotaMonth("2026-10");
		expect(periodKeysInRange(start, end)).toEqual(["2026-10", "2026-11"]);
	});

	test("range spanning several months lists all of them", () => {
		const start = localTs(2026, 8, 23);
		const end = localTs(2026, 9, 24);
		expect(periodKeysInRange(start, end)).toEqual(["2026-09", "2026-10"]);
	});

	test("crosses year boundary", () => {
		const start = localTs(2026, 10, 15);
		const end = localTs(2027, 1, 1);
		expect(periodKeysInRange(start, end)).toEqual([
			"2026-11",
			"2026-12",
			"2027-01",
			"2027-02",
		]);
	});

	test("inverted range is empty", () => {
		expect(periodKeysInRange(10, 5)).toEqual([]);
	});
});

describe("listUpcomingFixedExpensesForUser", () => {
	const october = [
		fixed({ name: "Gimnasio", amount: 70_000, dayOfMonth: 1 }),
		fixed({ name: "Abono a capital", amount: 500_000, dayOfMonth: 1 }),
		fixed({ name: "Ahorro de emergencia", amount: 100_000, dayOfMonth: 1 }),
		fixed({ name: "Burrocopa", amount: 80_000, dayOfMonth: 1 }),
		fixed({ name: "Licencia de claude", amount: 66_000, dayOfMonth: 2 }),
	];

	test("returns every pending fixed expense of the month (Oct 2026)", async () => {
		const { start, end } = bogotaMonth("2026-10");
		const result = await listUpcomingFixedExpensesForUser(
			fakeCtx(october),
			USER,
			start,
			end,
			50,
		);
		expect(result.items).toHaveLength(5);
		expect(result.pendingTotal).toBe(816_000);
		expect(result.items.every((i) => i.periodKey === "2026-10")).toBe(true);
		expect(result.items.at(-1)?.name).toBe("Licencia de claude");
	});

	test("range starting in the previous month still includes October dues", async () => {
		// Regression: only the month of periodStart used to be evaluated.
		const result = await listUpcomingFixedExpensesForUser(
			fakeCtx(october),
			USER,
			localTs(2026, 8, 23),
			localTs(2026, 9, 24),
			50,
		);
		expect(result.periodKeys).toEqual(["2026-09", "2026-10"]);
		expect(result.pendingTotal).toBe(816_000);
		expect(result.items).toHaveLength(5);
	});

	test("multi-month range counts one occurrence per month", async () => {
		const gym = fixed({ name: "Gimnasio", amount: 70_000, dayOfMonth: 1 });
		const { start } = bogotaMonth("2026-10");
		const { end } = bogotaMonth("2026-12");
		const result = await listUpcomingFixedExpensesForUser(
			fakeCtx([gym]),
			USER,
			start,
			end,
			50,
		);
		expect(result.items.map((i) => i.periodKey)).toEqual([
			"2026-10",
			"2026-11",
			"2026-12",
		]);
		expect(result.pendingTotal).toBe(210_000);
	});

	test("wrong year (2024) yields nothing: expenses created in 2026", async () => {
		// The originally reported call used 1727049600000..1729728000000 (2024).
		const result = await listUpcomingFixedExpensesForUser(
			fakeCtx(october),
			USER,
			1727049600000,
			1729728000000,
			50,
		);
		expect(result.periodKeys).toEqual(["2024-09", "2024-10"]);
		expect(result.items).toEqual([]);
	});

	test("paid expenses are excluded by default and included with includePaid", async () => {
		const paid = fixed({
			name: "Gimnasio",
			amount: 70_000,
			lastPaidPeriodKey: "2026-10",
		});
		const pending = fixed({ name: "Burrocopa", amount: 80_000 });
		const { start, end } = bogotaMonth("2026-10");

		const pendingOnly = await listUpcomingFixedExpensesForUser(
			fakeCtx([paid, pending]),
			USER,
			start,
			end,
		);
		expect(pendingOnly.items.map((i) => i.name)).toEqual(["Burrocopa"]);
		expect(pendingOnly.pendingTotal).toBe(80_000);
		expect(pendingOnly.paidTotal).toBeUndefined();

		const all = await listUpcomingFixedExpensesForUser(
			fakeCtx([paid, pending]),
			USER,
			start,
			end,
			50,
			{ includePaid: true },
		);
		expect(all.items).toHaveLength(2);
		expect(all.pendingTotal).toBe(80_000);
		expect(all.paidTotal).toBe(70_000);
		expect(all.items.find((i) => i.name === "Gimnasio")?.isPaid).toBe(true);
	});

	test("skipped month and single-month expenses respect their period", async () => {
		const skipped = fixed({
			name: "Skip",
			amount: 1,
			skippedPeriodKey: "2026-10",
		});
		const onlyNov = fixed({
			name: "Solo nov",
			amount: 2,
			onlyPeriodKey: "2026-11",
		});
		const { start, end } = bogotaMonth("2026-10");
		const result = await listUpcomingFixedExpensesForUser(
			fakeCtx([skipped, onlyNov]),
			USER,
			start,
			end,
		);
		expect(result.items).toEqual([]);

		const nov = bogotaMonth("2026-11");
		const novResult = await listUpcomingFixedExpensesForUser(
			fakeCtx([skipped, onlyNov]),
			USER,
			nov.start,
			nov.end,
		);
		expect(novResult.items.map((i) => i.name)).toEqual(["Skip", "Solo nov"]);
	});

	test("limit truncates items but not pendingTotal", async () => {
		const { start, end } = bogotaMonth("2026-10");
		const result = await listUpcomingFixedExpensesForUser(
			fakeCtx(october),
			USER,
			start,
			end,
			2,
		);
		expect(result.items).toHaveLength(2);
		expect(result.pendingTotal).toBe(816_000);
	});
});
