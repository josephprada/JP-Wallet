import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { type AgentGatewayErrorCode, hashToken } from "./lib/apiTokenAuth";

const http = httpRouter();

auth.addHttpRoutes(http);

const STATUS_BY_CODE: Record<AgentGatewayErrorCode, number> = {
	unauthorized: 401,
	forbidden: 403,
	validation: 400,
	not_found: 404,
	confirmation_required: 428,
	rate_limited: 429,
	conflict: 409,
	internal: 500,
};

// V1: sin CORS abierto (sin `Access-Control-Allow-Origin: *`); el canal es
// server-to-server (MCP gateway), no un cliente de navegador.
const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...CORS_HEADERS },
	});
}

http.route({
	path: "/agent/v1/rpc",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const authorization = request.headers.get("Authorization") ?? "";
		const [scheme, tokenPlaintext] = authorization.split(" ");
		if (scheme !== "Bearer" || !tokenPlaintext) {
			return jsonResponse(
				{
					ok: false,
					error: { code: "unauthorized", message: "Missing bearer token" },
				},
				401,
			);
		}

		let tokenHash: string;
		try {
			tokenHash = await hashToken(tokenPlaintext);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Token hashing failed";
			return jsonResponse(
				{ ok: false, error: { code: "internal", message } },
				500,
			);
		}

		let body: { tool?: unknown; args?: unknown; confirm?: unknown };
		try {
			body = await request.json();
		} catch {
			return jsonResponse(
				{
					ok: false,
					error: { code: "validation", message: "Invalid JSON body" },
				},
				400,
			);
		}

		if (typeof body.tool !== "string" || body.tool.length === 0) {
			return jsonResponse(
				{
					ok: false,
					error: { code: "validation", message: '"tool" is required' },
				},
				400,
			);
		}

		const result = await ctx.runMutation(
			internal.agentGateway.authenticateAndDispatch,
			{
				tokenHash,
				tool: body.tool,
				args: body.args ?? {},
				confirm: typeof body.confirm === "boolean" ? body.confirm : undefined,
			},
		);

		const status = result.ok ? 200 : (STATUS_BY_CODE[result.error.code] ?? 500);
		return jsonResponse(result, status);
	}),
});

http.route({
	path: "/agent/v1/rpc",
	method: "OPTIONS",
	handler: httpAction(async () => {
		return new Response(null, {
			status: 204,
			headers: CORS_HEADERS,
		});
	}),
});

export default http;
