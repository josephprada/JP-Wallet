import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { type ApiScope, isApiScope } from "./apiScopes";

const BASE64URL_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const TOKEN_PLAINTEXT_PREFIX = "jpw_";
const TOKEN_RANDOM_BYTES = 32;

export type AgentGatewayErrorCode =
	| "unauthorized"
	| "forbidden"
	| "validation"
	| "not_found"
	| "confirmation_required"
	| "rate_limited"
	| "conflict"
	| "internal";

export class AgentGatewayError extends Error {
	code: AgentGatewayErrorCode;

	constructor(code: AgentGatewayErrorCode, message: string) {
		super(message);
		this.name = "AgentGatewayError";
		this.code = code;
	}
}

function toBase64Url(bytes: Uint8Array): string {
	let result = "";
	let i = 0;
	for (; i + 3 <= bytes.length; i += 3) {
		const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		result += BASE64URL_ALPHABET[(chunk >> 18) & 63];
		result += BASE64URL_ALPHABET[(chunk >> 12) & 63];
		result += BASE64URL_ALPHABET[(chunk >> 6) & 63];
		result += BASE64URL_ALPHABET[chunk & 63];
	}
	const remaining = bytes.length - i;
	if (remaining === 1) {
		const chunk = bytes[i] << 16;
		result += BASE64URL_ALPHABET[(chunk >> 18) & 63];
		result += BASE64URL_ALPHABET[(chunk >> 12) & 63];
	} else if (remaining === 2) {
		const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
		result += BASE64URL_ALPHABET[(chunk >> 18) & 63];
		result += BASE64URL_ALPHABET[(chunk >> 12) & 63];
		result += BASE64URL_ALPHABET[(chunk >> 6) & 63];
	}
	return result;
}

function bufferToHex(buffer: ArrayBuffer): string {
	return [...new Uint8Array(buffer)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/** Genera un PAT en texto plano `jpw_<base64url 32 bytes>`. Nunca se persiste. */
export function generateTokenPlaintext(): string {
	const bytes = new Uint8Array(TOKEN_RANDOM_BYTES);
	crypto.getRandomValues(bytes);
	return `${TOKEN_PLAINTEXT_PREFIX}${toBase64Url(bytes)}`;
}

/** Prefijo corto y no sensible usado en UI/logs para identificar el token. */
export function tokenPrefixFromPlaintext(plaintext: string): string {
	if (plaintext.length >= 12) {
		return plaintext.slice(0, 12);
	}
	return `${TOKEN_PLAINTEXT_PREFIX}${plaintext.slice(TOKEN_PLAINTEXT_PREFIX.length, TOKEN_PLAINTEXT_PREFIX.length + 6)}`;
}

/** SHA-256 hex de (pepper + plaintext). */
export async function hashToken(plaintext: string): Promise<string> {
	const pepper = resolveApiTokenPepper();
	const encoder = new TextEncoder();
	const digest = await crypto.subtle.digest(
		"SHA-256",
		encoder.encode(pepper + plaintext),
	);
	return bufferToHex(digest);
}

/**
 * Pepper vacío permitido por defecto (compat con PATs legacy hasheados sin pepper).
 * Activa `API_TOKEN_REQUIRE_PEPPER=1` en Convex **después** de configurar
 * `API_TOKEN_PEPPER` (y de rotar PATs si el pepper cambia).
 */
function resolveApiTokenPepper(): string {
	const pepper = process.env.API_TOKEN_PEPPER ?? "";
	if (!pepper && process.env.API_TOKEN_REQUIRE_PEPPER === "1") {
		throw new AgentGatewayError(
			"internal",
			"API_TOKEN_PEPPER is not configured",
		);
	}
	return pepper;
}

export type AuthenticatedApiToken = {
	userId: Id<"users">;
	tokenId: Id<"apiTokens">;
	scopes: ApiScope[];
	tokenPrefix: string;
};

/**
 * Autentica un PAT ya hasheado (el httpAction hashea el Bearer y no pasa plaintext).
 */
export async function authenticateApiTokenByHash(
	ctx: MutationCtx,
	tokenHash: string | null | undefined,
): Promise<AuthenticatedApiToken> {
	if (!tokenHash || !tokenHash.trim()) {
		throw new AgentGatewayError("unauthorized", "Missing bearer token");
	}

	const token = await ctx.db
		.query("apiTokens")
		.withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash.trim()))
		.unique();

	if (!token) {
		throw new AgentGatewayError("unauthorized", "Invalid token");
	}

	if (token.revokedAt) {
		await recordAudit(ctx, {
			userId: token.userId,
			tokenId: token._id,
			action: "auth_failed",
			success: false,
			errorCode: "unauthorized",
			summary: "Token revoked",
		});
		throw new AgentGatewayError("unauthorized", "Token has been revoked");
	}

	if (token.expiresAt !== undefined && token.expiresAt <= Date.now()) {
		await recordAudit(ctx, {
			userId: token.userId,
			tokenId: token._id,
			action: "auth_failed",
			success: false,
			errorCode: "unauthorized",
			summary: "Token expired",
		});
		throw new AgentGatewayError("unauthorized", "Token has expired");
	}

	await ctx.db.patch(token._id, { lastUsedAt: Date.now() });

	return {
		userId: token.userId,
		tokenId: token._id,
		scopes: token.scopes.filter(isApiScope),
		tokenPrefix: token.tokenPrefix,
	};
}

/**
 * Autentica un PAT en texto plano (create/tests). Preferir
 * `authenticateApiTokenByHash` en el gateway HTTP.
 */
export async function authenticateApiToken(
	ctx: MutationCtx,
	bearerToken: string | null | undefined,
): Promise<AuthenticatedApiToken> {
	if (!bearerToken || !bearerToken.trim()) {
		throw new AgentGatewayError("unauthorized", "Missing bearer token");
	}
	const tokenHash = await hashToken(bearerToken.trim());
	return authenticateApiTokenByHash(ctx, tokenHash);
}

/** Lanza `forbidden` si al `scopes` le falta alguno de los `required`. */
export function assertScopes(
	scopes: readonly string[],
	required: readonly ApiScope[],
): void {
	const missing = required.filter((scope) => !scopes.includes(scope));
	if (missing.length > 0) {
		throw new AgentGatewayError(
			"forbidden",
			`Missing required scope(s): ${missing.join(", ")}`,
		);
	}
}

export async function recordAudit(
	ctx: MutationCtx,
	entry: {
		userId: Id<"users">;
		tokenId: Id<"apiTokens">;
		action: string;
		success: boolean;
		errorCode?: string;
		summary?: string;
	},
): Promise<void> {
	await ctx.db.insert("apiAuditLog", {
		userId: entry.userId,
		tokenId: entry.tokenId,
		action: entry.action,
		success: entry.success,
		errorCode: entry.errorCode,
		summary: entry.summary?.slice(0, 500),
		createdAt: Date.now(),
	});
}
