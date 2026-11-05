import { describe, expect, test } from "bun:test";
import { DEFAULT_VAPID_SUBJECT, normalizeVapidSubject } from "./vapid";

describe("normalizeVapidSubject", () => {
	test("adds mailto: to a bare email (web-push rejects it otherwise)", () => {
		expect(normalizeVapidSubject("jprada7@udi.edu.co")).toBe(
			"mailto:jprada7@udi.edu.co",
		);
	});

	test("keeps valid mailto: and https: subjects", () => {
		expect(normalizeVapidSubject("mailto:a@b.co")).toBe("mailto:a@b.co");
		expect(normalizeVapidSubject("https://wallet.lavalex.co")).toBe(
			"https://wallet.lavalex.co",
		);
	});

	test("trims whitespace and surrounding quotes from env values", () => {
		expect(normalizeVapidSubject('  "a@b.co"\n')).toBe("mailto:a@b.co");
	});

	test("falls back to the default when empty or missing", () => {
		expect(normalizeVapidSubject(undefined)).toBe(DEFAULT_VAPID_SUBJECT);
		expect(normalizeVapidSubject("   ")).toBe(DEFAULT_VAPID_SUBJECT);
	});

	test("returns null for values that cannot be fixed", () => {
		expect(normalizeVapidSubject("not a subject")).toBeNull();
	});
});
