import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	type ApiScope,
	DEFAULT_READ_SCOPES,
	isApiScope,
} from "./lib/apiScopes";
import {
	generateTokenPlaintext,
	hashToken,
	tokenPrefixFromPlaintext,
} from "./lib/apiTokenAuth";
import { requireUserId } from "./lib/auth";
import {
	apiScopeValidator,
	DEFAULT_API_TOKEN_TTL_MS,
	validateNonEmptyName,
} from "./lib/validators";

const MAX_ACTIVE_TOKENS = 10;
const MAX_TOKEN_NAME_LENGTH = 80;

export type ApiTokenStatus = "active" | "expired" | "revoked";

export type ApiTokenPublic = {
	_id: Id<"apiTokens">;
	name: string;
	tokenPrefix: string;
	scopes: ApiScope[];
	expiresAt?: number;
	lastUsedAt?: number;
	revokedAt?: number;
	createdAt: number;
	status: ApiTokenStatus;
};

function tokenStatus(token: Doc<"apiTokens">, now: number): ApiTokenStatus {
	if (token.revokedAt) return "revoked";
	if (token.expiresAt !== undefined && token.expiresAt <= now) {
		return "expired";
	}
	return "active";
}

function toPublic(token: Doc<"apiTokens">, now: number): ApiTokenPublic {
	return {
		_id: token._id,
		name: token.name,
		tokenPrefix: token.tokenPrefix,
		scopes: token.scopes.filter(isApiScope),
		expiresAt: token.expiresAt,
		lastUsedAt: token.lastUsedAt,
		revokedAt: token.revokedAt,
		createdAt: token.createdAt,
		status: tokenStatus(token, now),
	};
}

function validateScopes(scopes: string[]): ApiScope[] {
	if (scopes.length === 0) return DEFAULT_READ_SCOPES;
	const unique = [...new Set(scopes)];
	for (const scope of unique) {
		if (!isApiScope(scope)) {
			throw new Error("Invalid scopes");
		}
	}
	return unique as ApiScope[];
}

function validateExpiry(expiresAt: number | undefined): number {
	if (expiresAt === undefined) {
		return Date.now() + DEFAULT_API_TOKEN_TTL_MS;
	}
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
		throw new Error("Invalid expiry");
	}
	return expiresAt;
}

export const list = query({
	args: {},
	handler: async (ctx): Promise<ApiTokenPublic[]> => {
		const userId = await requireUserId(ctx);
		const tokens = await ctx.db
			.query("apiTokens")
			.withIndex("by_user_created", (q) => q.eq("userId", userId))
			.collect();

		const now = Date.now();
		return tokens
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((token) => toPublic(token, now));
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		scopes: v.array(apiScopeValidator),
		expiresAt: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ token: ApiTokenPublic; tokenPlaintext: string }> => {
		const userId = await requireUserId(ctx);
		const name = validateNonEmptyName(args.name).slice(
			0,
			MAX_TOKEN_NAME_LENGTH,
		);
		const scopes = validateScopes(args.scopes);
		const expiresAt = validateExpiry(args.expiresAt);

		const existing = await ctx.db
			.query("apiTokens")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const activeCount = existing.filter((token) => !token.revokedAt).length;
		if (activeCount >= MAX_ACTIVE_TOKENS) {
			throw new Error("Too many active tokens");
		}

		const tokenPlaintext = generateTokenPlaintext();
		const tokenHash = await hashToken(tokenPlaintext);
		const tokenPrefix = tokenPrefixFromPlaintext(tokenPlaintext);
		const now = Date.now();

		const tokenId = await ctx.db.insert("apiTokens", {
			userId,
			name,
			tokenPrefix,
			tokenHash,
			scopes,
			expiresAt,
			createdAt: now,
			updatedAt: now,
		});

		const token = await ctx.db.get(tokenId);
		if (!token) {
			throw new Error("Token not found after creation");
		}

		return {
			token: toPublic(token, now),
			tokenPlaintext,
		};
	},
});

export const revoke = mutation({
	args: { tokenId: v.id("apiTokens") },
	handler: async (ctx, { tokenId }) => {
		const userId = await requireUserId(ctx);
		const token = await ctx.db.get(tokenId);
		if (!token || token.userId !== userId) {
			throw new Error("Token not found");
		}

		if (!token.revokedAt) {
			await ctx.db.patch(tokenId, {
				revokedAt: Date.now(),
				updatedAt: Date.now(),
			});
		}

		return { ok: true };
	},
});

/** Permanent delete for inactive tokens (revoked or expired). Active must revoke first. */
export const remove = mutation({
	args: { tokenId: v.id("apiTokens") },
	handler: async (ctx, { tokenId }) => {
		const userId = await requireUserId(ctx);
		const token = await ctx.db.get(tokenId);
		if (!token || token.userId !== userId) {
			throw new Error("Token not found");
		}

		const now = Date.now();
		const status = tokenStatus(token, now);
		if (status === "active") {
			throw new Error("Revoke the token before deleting it");
		}

		const auditRows = await ctx.db
			.query("apiAuditLog")
			.withIndex("by_token_created", (q) => q.eq("tokenId", tokenId))
			.collect();
		for (const row of auditRows) {
			await ctx.db.delete(row._id);
		}

		await ctx.db.delete(tokenId);
		return { ok: true };
	},
});
