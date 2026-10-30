import { describe, expect, test } from "bun:test";
import { computeBalanceAdjustment } from "./accountBalanceAdjustment";

describe("computeBalanceAdjustment", () => {
	test("shifts initialBalance by the same delta so history stays consistent", () => {
		const result = computeBalanceAdjustment(
			{ balance: 1_200_000, initialBalance: 1_000_000 },
			1_150_000,
		);
		expect(result).toEqual({
			balance: 1_150_000,
			initialBalance: 950_000,
			delta: -50_000,
		});
	});

	test("supports raising the balance", () => {
		const result = computeBalanceAdjustment(
			{ balance: 100_000, initialBalance: 0 },
			300_000,
		);
		expect(result).toEqual({
			balance: 300_000,
			initialBalance: 200_000,
			delta: 200_000,
		});
	});

	test("returns zero delta when the balance does not change", () => {
		expect(
			computeBalanceAdjustment({ balance: 50_000, initialBalance: 50_000 }, 50_000)
				.delta,
		).toBe(0);
	});
});
