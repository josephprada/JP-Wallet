import { useToastStore } from "@app/stores/toast";
import { sanitizeAppPath } from "@app/lib/core/safeAppPath";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

const TYPE_LABELS: Record<string, string> = {
	budget_threshold: "Presupuesto",
	fixed_expense_reminder: "Gasto fijo",
	fixed_expense_overdue: "Gasto fijo en mora",
	credit_due: "Crédito",
	period_report: "Reporte",
};

const TYPE_BODIES: Record<string, string> = {
	budget_threshold: "Has cruzado un umbral de presupuesto",
	fixed_expense_reminder: "Tienes un pago próximo",
	fixed_expense_overdue: "Un gasto fijo sigue sin pagar",
	credit_due: "Tienes una cuota por vencer",
	period_report: "Nuevo reporte disponible",
};

const TYPE_URLS: Record<string, string> = {
	budget_threshold: "/budgets",
	fixed_expense_reminder: "/budgets",
	fixed_expense_overdue: "/budgets",
	credit_due: "/credits",
	period_report: "/reports",
};

const CURSOR_KEY = "jpw:notif-toast-cursor";

function notificationKey(item: {
	type: string;
	referenceId: string;
	sentAt: number;
}): string {
	return `${item.type}:${item.referenceId}:${item.sentAt}`;
}

function loadPersistedKeys(): Set<string> {
	try {
		const raw = sessionStorage.getItem(CURSOR_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw) as string[];
		return new Set(Array.isArray(parsed) ? parsed : []);
	} catch {
		return new Set();
	}
}

function persistKeys(keys: Set<string>): void {
	try {
		sessionStorage.setItem(CURSOR_KEY, JSON.stringify([...keys].slice(-50)));
	} catch {
		// ignore quota / private mode
	}
}

export function NotificationListener() {
	const { isAuthenticated } = useConvexAuth();
	const navigate = useNavigate();
	const recent = useQuery(
		api.notifications.listRecentInApp,
		isAuthenticated ? { limit: 5 } : "skip",
	);
	const show = useToastStore((s) => s.show);
	const seenRef = useRef<Set<string>>(loadPersistedKeys());
	const seededRef = useRef(false);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string; url?: string } | undefined;
			if (data?.type === "NOTIFICATION_NAV" && typeof data.url === "string") {
				navigate(sanitizeAppPath(data.url));
			}
		};
		navigator.serviceWorker?.addEventListener("message", onMessage);
		return () => {
			navigator.serviceWorker?.removeEventListener("message", onMessage);
		};
	}, [navigate]);

	useEffect(() => {
		if (!recent) return;

		if (!seededRef.current) {
			for (const item of recent) {
				seenRef.current.add(notificationKey(item));
			}
			persistKeys(seenRef.current);
			seededRef.current = true;
			return;
		}

		for (const item of recent) {
			const key = notificationKey(item);
			if (seenRef.current.has(key)) continue;
			seenRef.current.add(key);
			show({
				title: TYPE_LABELS[item.type] ?? "JP-WALLET",
				body: TYPE_BODIES[item.type] ?? "Tienes una notificación nueva",
				url: TYPE_URLS[item.type] ?? "/budgets",
			});
		}
		persistKeys(seenRef.current);
	}, [recent, show]);

	return null;
}
