import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";

export const themeValidator = v.union(
	v.literal("light"),
	v.literal("dark"),
	v.literal("system"),
);

export const accentPresetValidator = v.union(
	v.literal("green-bolt"),
	v.literal("cyan-neon"),
	v.literal("amber-gold"),
	v.literal("violet-pulse"),
	v.literal("coral-heat"),
);

export const dangerPresetValidator = v.union(
	v.literal("red-classic"),
	v.literal("rose-soft"),
	v.literal("orange-alert"),
	v.literal("crimson-deep"),
);

export const typographyPresetValidator = v.union(
	v.literal("inter-default"),
	v.literal("formal-serif"),
	v.literal("elegant-italic"),
	v.literal("handwriting"),
);

const LEGACY_TYPOGRAPHY_PRESETS: Record<string, ResolvedUserPreferences["typographyPreset"]> = {
	"dm-sans": "formal-serif",
	"source-sans": "elegant-italic",
	"system-native": "handwriting",
};

function normalizeTypographyPreset(
	value: string | undefined,
): ResolvedUserPreferences["typographyPreset"] {
	if (!value) return DEFAULT_USER_PREFERENCES.typographyPreset;
	if (
		value === "inter-default" ||
		value === "formal-serif" ||
		value === "elegant-italic" ||
		value === "handwriting"
	) {
		return value;
	}
	return LEGACY_TYPOGRAPHY_PRESETS[value] ?? DEFAULT_USER_PREFERENCES.typographyPreset;
}

export const groupingValidator = v.union(
	v.literal("week"),
	v.literal("month"),
	v.literal("quarter"),
	v.literal("semester"),
);

export const languageValidator = v.union(v.literal("es"), v.literal("en"));

export const DEFAULT_USER_PREFERENCES = {
	theme: "dark" as const,
	accentPreset: "green-bolt" as const,
	dangerPreset: "red-classic" as const,
	typographyPreset: "inter-default" as const,
	defaultGrouping: "month" as const,
	language: "es" as const,
	notificationsEnabled: true,
	reportEmailEnabled: false,
	pushEnabled: false,
	balanceEditEnabled: false,
};

export type ResolvedUserPreferences = {
	theme: "light" | "dark" | "system";
	accentPreset:
		| "green-bolt"
		| "cyan-neon"
		| "amber-gold"
		| "violet-pulse"
		| "coral-heat";
	dangerPreset: "red-classic" | "rose-soft" | "orange-alert" | "crimson-deep";
	typographyPreset: "inter-default" | "formal-serif" | "elegant-italic" | "handwriting";
	defaultGrouping: "week" | "month" | "quarter" | "semester";
	language: "es" | "en";
	notificationsEnabled: boolean;
	reportEmailEnabled: boolean;
	pushEnabled: boolean;
	balanceEditEnabled: boolean;
	updatedAt: number;
};

type PartialPreferencesDoc = {
	theme?: ResolvedUserPreferences["theme"];
	accentPreset?: ResolvedUserPreferences["accentPreset"];
	dangerPreset?: ResolvedUserPreferences["dangerPreset"];
	typographyPreset?: ResolvedUserPreferences["typographyPreset"];
	defaultGrouping?: ResolvedUserPreferences["defaultGrouping"];
	language?: ResolvedUserPreferences["language"];
	notificationsEnabled?: boolean;
	reportEmailEnabled?: boolean;
	pushEnabled?: boolean;
	balanceEditEnabled?: boolean;
	updatedAt?: number;
};

export function resolveUserPreferences(
	doc: PartialPreferencesDoc | null | undefined,
): ResolvedUserPreferences {
	const updatedAt = doc?.updatedAt ?? Date.now();
	return {
		theme: doc?.theme ?? DEFAULT_USER_PREFERENCES.theme,
		accentPreset: doc?.accentPreset ?? DEFAULT_USER_PREFERENCES.accentPreset,
		dangerPreset: doc?.dangerPreset ?? DEFAULT_USER_PREFERENCES.dangerPreset,
		typographyPreset: normalizeTypographyPreset(doc?.typographyPreset),
		defaultGrouping:
			doc?.defaultGrouping ?? DEFAULT_USER_PREFERENCES.defaultGrouping,
		language: doc?.language ?? DEFAULT_USER_PREFERENCES.language,
		notificationsEnabled:
			doc?.notificationsEnabled ??
			DEFAULT_USER_PREFERENCES.notificationsEnabled,
		reportEmailEnabled:
			doc?.reportEmailEnabled ?? DEFAULT_USER_PREFERENCES.reportEmailEnabled,
		pushEnabled: doc?.pushEnabled ?? DEFAULT_USER_PREFERENCES.pushEnabled,
		balanceEditEnabled:
			doc?.balanceEditEnabled ?? DEFAULT_USER_PREFERENCES.balanceEditEnabled,
		updatedAt,
	};
}

export function buildDefaultPreferencesInsert(userId: Id<"users">) {
	return {
		userId,
		...DEFAULT_USER_PREFERENCES,
		updatedAt: Date.now(),
	};
}
