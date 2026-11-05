import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";

/**
 * Login directo SOLO para pruebas locales (p. ej. redes que bloquean Google OAuth).
 *
 * Seguridad: el proveedor solo se registra si la deployment de Convex tiene
 * `DEV_LOGIN_SECRET` (nunca configurarla en producción) y exige ese secreto.
 * Únicamente inicia sesión con usuarios que ya existen (creados vía Google).
 */
export const DEV_LOGIN_PROVIDER_ID = "dev-login";

const MIN_SECRET_LENGTH = 24;

function devLoginSecret(): string | null {
	const secret = process.env.DEV_LOGIN_SECRET;
	return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function constantTimeEquals(a: string, b: string): boolean {
	let diff = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	}
	return diff === 0;
}

export const findUserIdByEmail = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, { email }): Promise<Id<"users"> | null> => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", email))
			.first();
		return user?._id ?? null;
	},
});

export function devLoginProviders() {
	if (!devLoginSecret()) return [];

	return [
		ConvexCredentials({
			id: DEV_LOGIN_PROVIDER_ID,
			authorize: async (credentials, ctx) => {
				const secret = devLoginSecret();
				const provided = credentials.secret;
				const email = credentials.email;
				if (!secret || typeof provided !== "string" || typeof email !== "string") {
					return null;
				}
				if (!constantTimeEquals(provided, secret)) {
					return null;
				}

				const userId = await ctx.runQuery(internal.devLogin.findUserIdByEmail, {
					email: email.trim().toLowerCase(),
				});
				return userId ? { userId } : null;
			},
		}),
	];
}
