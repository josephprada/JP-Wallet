import { describe, expect, it } from "bun:test";
import { isSafeAppPath, sanitizeAppPath } from "./safeAppPath";

describe("isSafeAppPath", () => {
	it("allows relative app paths", () => {
		expect(isSafeAppPath("/")).toBe(true);
		expect(isSafeAppPath("/budgets")).toBe(true);
		expect(isSafeAppPath("/credits/abc?x=1")).toBe(true);
	});

	it("rejects absolute and protocol-relative URLs", () => {
		expect(isSafeAppPath("https://evil.example")).toBe(false);
		expect(isSafeAppPath("//evil.example")).toBe(false);
		expect(isSafeAppPath("http://evil.example/phish")).toBe(false);
		expect(isSafeAppPath("javascript:alert(1)")).toBe(false);
	});
});

describe("sanitizeAppPath", () => {
	it("falls back to / for unsafe urls", () => {
		expect(sanitizeAppPath("https://evil.example")).toBe("/");
		expect(sanitizeAppPath(undefined)).toBe("/");
		expect(sanitizeAppPath("/budgets")).toBe("/budgets");
	});
});
