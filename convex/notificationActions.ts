"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { PDFDocument, StandardFonts } from "pdf-lib";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { normalizeVapidSubject } from "./lib/vapid";

export const sendEmailWithReport = internalAction({
	args: {
		to: v.string(),
		subject: v.string(),
		html: v.string(),
		label: v.string(),
		summary: v.object({
			totalIncome: v.number(),
			totalExpense: v.number(),
			net: v.number(),
			byCategory: v.array(
				v.object({
					name: v.string(),
					amount: v.number(),
				}),
			),
		}),
	},
	handler: async (_ctx, args) => {
		const pdf = await PDFDocument.create();
		const page = pdf.addPage([595, 842]);
		const font = await pdf.embedFont(StandardFonts.Helvetica);
		const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
		let y = 800;
		page.drawText(`JP-WALLET — ${args.label}`, { x: 50, y, size: 16, font: bold });
		y -= 30;
		page.drawText(`Ingresos: $${args.summary.totalIncome.toLocaleString("es-CO")}`, {
			x: 50,
			y,
			size: 12,
			font,
		});
		y -= 18;
		page.drawText(`Gastos: $${args.summary.totalExpense.toLocaleString("es-CO")}`, {
			x: 50,
			y,
			size: 12,
			font,
		});
		y -= 18;
		page.drawText(`Neto: $${args.summary.net.toLocaleString("es-CO")}`, {
			x: 50,
			y,
			size: 12,
			font: bold,
		});
		y -= 30;
		for (const cat of args.summary.byCategory.slice(0, 20)) {
			page.drawText(`${cat.name}: $${cat.amount.toLocaleString("es-CO")}`, {
				x: 50,
				y,
				size: 11,
				font,
			});
			y -= 16;
			if (y < 60) break;
		}
		const bytes = await pdf.save();
		const pdfBase64 = Buffer.from(bytes).toString("base64");

		const apiKey = process.env.RESEND_API_KEY;
		const from = process.env.EMAIL_FROM ?? "JP-WALLET <onboarding@resend.dev>";
		if (!apiKey) {
			console.warn("RESEND_API_KEY not set; skipping email");
			return { skipped: true };
		}

		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from,
				to: [args.to],
				subject: args.subject,
				html: args.html,
				attachments: [
					{
						filename: "reporte-jp-wallet.pdf",
						content: pdfBase64,
					},
				],
			}),
		});

		if (!res.ok) {
			throw new Error(`Resend error: ${await res.text()}`);
		}
		return { ok: true };
	},
});

export const sendEmail = internalAction({
	args: {
		to: v.string(),
		subject: v.string(),
		html: v.string(),
		pdfBase64: v.optional(v.string()),
		pdfFilename: v.optional(v.string()),
	},
	handler: async (_ctx, args) => {
		const apiKey = process.env.RESEND_API_KEY;
		const from = process.env.EMAIL_FROM ?? "JP-WALLET <onboarding@resend.dev>";
		if (!apiKey) {
			console.warn("RESEND_API_KEY not set; skipping email");
			return { skipped: true };
		}

		const attachments = args.pdfBase64
			? [
					{
						filename: args.pdfFilename ?? "reporte.pdf",
						content: args.pdfBase64,
					},
				]
			: undefined;

		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from,
				to: [args.to],
				subject: args.subject,
				html: args.html,
				attachments,
			}),
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Resend error: ${text}`);
		}

		return { ok: true };
	},
});

type PushSubscriptionPayload = {
	endpoint: string;
	p256dh: string;
	auth: string;
};

type PushSendResult =
	| {
			skipped: true;
			skipReason: "vapid_missing" | "vapid_invalid";
			sent: 0;
			gone: string[];
			failures: { statusCode?: number; message: string }[];
	  }
	| {
			ok: true;
			skipped: false;
			sent: number;
			gone: string[];
			failures: { statusCode?: number; message: string }[];
	  };

async function deliverWebPush(args: {
	subscriptions: PushSubscriptionPayload[];
	title: string;
	body: string;
	url: string;
	onGone?: (endpoints: string[]) => Promise<void>;
}): Promise<PushSendResult> {
	const publicKey = process.env.VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;
	const subject = normalizeVapidSubject(process.env.VAPID_SUBJECT);

	if (!publicKey || !privateKey) {
		console.warn("VAPID keys not set; skipping push");
		return {
			skipped: true,
			skipReason: "vapid_missing",
			sent: 0,
			gone: [],
			failures: [],
		};
	}

	try {
		if (!subject) throw new Error("VAPID_SUBJECT must be mailto: or https:");
		webpush.setVapidDetails(subject, publicKey, privateKey);
	} catch (err: unknown) {
		console.error("Invalid VAPID configuration; skipping push", {
			message: err instanceof Error ? err.message : String(err),
		});
		return {
			skipped: true,
			skipReason: "vapid_invalid",
			sent: 0,
			gone: [],
			failures: [],
		};
	}

	const payload = JSON.stringify({
		title: args.title,
		body: args.body,
		url: args.url,
	});

	const gone: string[] = [];
	const failures: { statusCode?: number; message: string }[] = [];
	let sent = 0;

	for (const sub of args.subscriptions) {
		try {
			await webpush.sendNotification(
				{
					endpoint: sub.endpoint,
					keys: { p256dh: sub.p256dh, auth: sub.auth },
				},
				payload,
			);
			sent += 1;
			} catch (err: unknown) {
				const status = (err as { statusCode?: number }).statusCode;
				const message = err instanceof Error ? err.message : "push_send_failed";
				// 404/410 = expired endpoint. 401/403/400 = often VAPID mismatch
				// after key rotation — drop the stale subscription.
				if (
					status === 404 ||
					status === 410 ||
					status === 400 ||
					status === 401 ||
					status === 403
				) {
					gone.push(sub.endpoint);
					console.warn("web-push dropping subscription", { status, message });
				} else {
					console.warn("web-push send failed", { status, message });
					failures.push({ statusCode: status, message });
				}
			}
	}

	if (gone.length > 0 && args.onGone) {
		await args.onGone(gone);
	}

	return { ok: true, skipped: false, sent, gone, failures };
}

export const sendPush = internalAction({
	args: {
		subscriptions: v.array(
			v.object({
				endpoint: v.string(),
				p256dh: v.string(),
				auth: v.string(),
			}),
		),
		title: v.string(),
		body: v.string(),
		url: v.string(),
	},
	handler: async (ctx, args): Promise<PushSendResult> => {
		return deliverWebPush({
			...args,
			onGone: async (endpoints) => {
				await ctx.runMutation(internal.notifications.removePushByEndpoints, {
					endpoints,
				});
			},
		});
	},
});

export type SendTestPushResult =
	| { status: "unauthenticated" }
	| { status: "notifications_disabled" }
	| { status: "push_disabled" }
	| { status: "no_subscription" }
	| { status: "vapid_missing"; subscriptionCount: number }
	| { status: "vapid_invalid"; subscriptionCount: number }
	| { status: "all_gone"; subscriptionCount: number; gone: number }
	| {
			status: "send_failed";
			subscriptionCount: number;
			gone: number;
			failures: number;
			detail?: string;
	  }
	| {
			status: "sent";
			subscriptionCount: number;
			sent: number;
			gone: number;
			failures: number;
	  };

/**
 * Diagnostic push for the signed-in user. Returns a clear status so Settings
 * can explain missing VAPID, empty subs, or dead endpoints.
 */
export const sendTestPush = action({
	args: {},
	handler: async (ctx): Promise<SendTestPushResult> => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return { status: "unauthenticated" };
		}

		const delivery = await ctx.runQuery(
			internal.notifications.getPushDeliveryContext,
			{ userId },
		);

		if (!delivery.notificationsEnabled) {
			return { status: "notifications_disabled" };
		}
		if (!delivery.pushEnabled) {
			return { status: "push_disabled" };
		}
		if (delivery.subscriptions.length === 0) {
			return { status: "no_subscription" };
		}

		const result = await deliverWebPush({
			subscriptions: delivery.subscriptions,
			title: "JP-WALLET",
			body: "Push de prueba — si ves esto, el envío funciona.",
			url: "/settings",
			onGone: async (endpoints) => {
				await ctx.runMutation(internal.notifications.removePushByEndpoints, {
					endpoints,
				});
			},
		});

		if (result.skipped) {
			return {
				status: result.skipReason,
				subscriptionCount: delivery.subscriptions.length,
			};
		}

		const goneCount = result.gone.length;
		const failureCount = result.failures.length;

		if (result.sent === 0 && goneCount > 0 && failureCount === 0) {
			return {
				status: "all_gone",
				subscriptionCount: delivery.subscriptions.length,
				gone: goneCount,
			};
		}

		if (result.sent === 0 && failureCount > 0) {
			return {
				status: "send_failed",
				subscriptionCount: delivery.subscriptions.length,
				gone: goneCount,
				failures: failureCount,
				detail: result.failures[0]?.message,
			};
		}

		return {
			status: "sent",
			subscriptionCount: delivery.subscriptions.length,
			sent: result.sent,
			gone: goneCount,
			failures: failureCount,
		};
	},
});
