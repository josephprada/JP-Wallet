import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	accentPresetValidator,
	buildDefaultPreferencesInsert,
	dangerPresetValidator,
	groupingValidator,
	languageValidator,
	DEFAULT_USER_PREFERENCES,
	resolveUserPreferences,
	themeValidator,
	typographyPresetValidator,
} from "./lib/preferences";

export const get = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return null;
		}

		const doc = await ctx.db
			.query("userPreferences")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();

		return resolveUserPreferences(doc);
	},
});

export const getTheme = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return null;
		}

		const doc = await ctx.db
			.query("userPreferences")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();

		return resolveUserPreferences(doc).theme;
	},
});

export const update = mutation({
	args: {
		theme: v.optional(themeValidator),
		accentPreset: v.optional(accentPresetValidator),
		dangerPreset: v.optional(dangerPresetValidator),
		typographyPreset: v.optional(typographyPresetValidator),
		defaultGrouping: v.optional(groupingValidator),
		language: v.optional(languageValidator),
		notificationsEnabled: v.optional(v.boolean()),
		reportEmailEnabled: v.optional(v.boolean()),
		pushEnabled: v.optional(v.boolean()),
		balanceEditEnabled: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		if (args.language === "en") {
			throw new Error("English is not available yet");
		}

		const hasChange = Object.values(args).some((value) => value !== undefined);
		if (!hasChange) {
			return;
		}

		const existing = await ctx.db
			.query("userPreferences")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();

		const patch = {
			...args,
			updatedAt: Date.now(),
		};

		if (existing) {
			await ctx.db.patch(existing._id, patch);
			return;
		}

		await ctx.db.insert("userPreferences", {
			userId,
			...DEFAULT_USER_PREFERENCES,
			...patch,
		});
	},
});

export const updateTheme = mutation({
	args: { theme: themeValidator },
	handler: async (ctx, { theme }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return;
		}

		const existing = await ctx.db
			.query("userPreferences")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, { theme, updatedAt: Date.now() });
			return;
		}

		await ctx.db.insert("userPreferences", {
			...buildDefaultPreferencesInsert(userId),
			theme,
		});
	},
});

export const resetAppearance = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new Error("Not authenticated");
		}

		const existing = await ctx.db
			.query("userPreferences")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.unique();

		const appearancePatch = {
			theme: DEFAULT_USER_PREFERENCES.theme,
			accentPreset: DEFAULT_USER_PREFERENCES.accentPreset,
			dangerPreset: DEFAULT_USER_PREFERENCES.dangerPreset,
			typographyPreset: DEFAULT_USER_PREFERENCES.typographyPreset,
			updatedAt: Date.now(),
		};

		if (existing) {
			await ctx.db.patch(existing._id, appearancePatch);
			return;
		}

		await ctx.db.insert("userPreferences", {
			userId,
			...DEFAULT_USER_PREFERENCES,
			...appearancePatch,
		});
	},
});
