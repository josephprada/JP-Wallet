/// <reference lib="webworker" />
import { sanitizeAppPath } from "@app/lib/core/safeAppPath";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

async function hasForegroundClient(): Promise<boolean> {
	const clients = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	});
	return clients.some((client) => {
		const windowClient = client as WindowClient;
		return (
			windowClient.focused ||
			windowClient.visibilityState === "visible"
		);
	});
}

self.addEventListener("push", (event) => {
	const data = event.data?.json() as
		| { title?: string; body?: string; url?: string }
		| undefined;
	event.waitUntil(
		(async () => {
			if (await hasForegroundClient()) {
				// App visible: in-app toast covers the user; skip OS tray spam.
				return;
			}
			await self.registration.showNotification(data?.title ?? "JP-WALLET", {
				body: data?.body ?? "",
				icon: "/icon.svg",
				data: { url: sanitizeAppPath(data?.url) },
			});
		})(),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = sanitizeAppPath(
		event.notification.data?.url as string | undefined,
	);
	event.waitUntil(
		(async () => {
			const clientList = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			for (const client of clientList) {
				const windowClient = client as WindowClient;
				if (
					"navigate" in windowClient &&
					typeof windowClient.navigate === "function"
				) {
					try {
						await windowClient.navigate(url);
					} catch {
						windowClient.postMessage({ type: "NOTIFICATION_NAV", url });
					}
					await windowClient.focus();
					return;
				}
				await windowClient.focus();
				windowClient.postMessage({ type: "NOTIFICATION_NAV", url });
				return;
			}
			await self.clients.openWindow(url);
		})(),
	);
});
