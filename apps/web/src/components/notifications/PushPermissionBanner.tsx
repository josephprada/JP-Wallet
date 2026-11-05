import {
	isPushSupported,
	registerPushSubscription,
	unregisterPushSubscription,
} from "@app/lib/push/registerPush";
import { usePreferencesStore } from "@app/stores/preferences";
import { api } from "@convex/_generated/api";
import { Button } from "@jp-ds";
import { useAction, useConvexAuth, useConvex, useMutation } from "convex/react";
import { useState } from "react";

type TestPushResult = {
	status: string;
	subscriptionCount?: number;
	sent?: number;
	gone?: number;
	failures?: number;
	detail?: string;
};

function messageForTestResult(result: TestPushResult): string {
	switch (result.status) {
		case "sent":
			return `Push de prueba enviada (${result.sent ?? 0} de ${result.subscriptionCount ?? 0}). Revisa la bandeja del sistema.`;
		case "vapid_missing":
			return "El servidor no tiene claves VAPID configuradas. Revisa VAPID_* en Convex.";
		case "vapid_invalid":
			return "La configuración VAPID del servidor es inválida (VAPID_SUBJECT o claves). Revisa VAPID_* en Convex.";
		case "no_subscription":
			return "No hay suscripción guardada. Desactiva y vuelve a Activar push.";
		case "push_disabled":
			return "pushEnabled está en false en el servidor. Vuelve a Activar push.";
		case "notifications_disabled":
			return "Las notificaciones generales están desactivadas en Ajustes.";
		case "all_gone":
			return "Suscripción obsoleta (tras cambio de claves). Pulsa Activar push de nuevo.";
		case "send_failed": {
			const detail = result.detail ? `: ${result.detail}` : "";
			return `El envío falló${detail}. Desactiva y vuelve a Activar push.`;
		}
		case "unauthenticated":
			return "Sesión no válida. Vuelve a iniciar sesión.";
		default:
			return `Resultado inesperado: ${result.status}`;
	}
}

export function PushPermissionBanner() {
	const convex = useConvex();
	const { isAuthenticated } = useConvexAuth();
	const pushEnabled = usePreferencesStore((s) => s.pushEnabled);
	const setPushEnabled = usePreferencesStore((s) => s.setPushEnabled);
	const updatePrefs = useMutation(api.userPreferences.update);
	const sendTestPush = useAction(api.notificationActions.sendTestPush);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	if (!isAuthenticated || !isPushSupported()) return null;

	const handleEnable = async () => {
		setBusy(true);
		setMessage(null);
		try {
			const ok = await registerPushSubscription(convex);
			if (ok) {
				setPushEnabled(true);
				await updatePrefs({ pushEnabled: true });
				setMessage("Notificaciones push activadas.");
			} else {
				setMessage(
					"No se pudo activar push. Concede permiso en el navegador e instala la app (PWA) en Android.",
				);
			}
		} finally {
			setBusy(false);
		}
	};

	const handleDisable = async () => {
		setBusy(true);
		setMessage(null);
		try {
			await unregisterPushSubscription(convex);
			setPushEnabled(false);
			await updatePrefs({ pushEnabled: false });
		} finally {
			setBusy(false);
		}
	};

	const handleTest = async () => {
		setBusy(true);
		setMessage(null);
		try {
			// Refresh subscription against current VAPID before sending.
			const refreshed = await registerPushSubscription(convex);
			if (!refreshed) {
				setPushEnabled(false);
				await updatePrefs({ pushEnabled: false });
				setMessage(
					"No se pudo renovar la suscripción. Activa push de nuevo y concede permiso.",
				);
				return;
			}
			setPushEnabled(true);
			await updatePrefs({ pushEnabled: true });

			const result = (await sendTestPush({})) as TestPushResult;
			setMessage(messageForTestResult(result));
			if (
				result.status === "all_gone" ||
				result.status === "no_subscription" ||
				result.status === "send_failed"
			) {
				setPushEnabled(false);
				await updatePrefs({ pushEnabled: false });
			}
		} catch (err: unknown) {
			const detail = err instanceof Error ? err.message : "error desconocido";
			setMessage(`No se pudo enviar la prueba: ${detail}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="push-banner glass">
			<div className="push-banner__copy">
				<div className="settings-row__title">Notificaciones push</div>
				<div className="settings-row__sub">
					{pushEnabled
						? "Recibirás avisos en la bandeja del sistema"
						: "Para Android: instala JP-WALLET en pantalla de inicio y permite notificaciones"}
				</div>
				{message ? <p className="push-banner__msg">{message}</p> : null}
			</div>
			<div className="push-banner__actions">
				{pushEnabled ? (
					<>
						<Button type="button" disabled={busy} onClick={handleTest}>
							Enviar prueba
						</Button>
						<Button
							type="button"
							variant="secondary"
							disabled={busy}
							onClick={handleDisable}
						>
							Desactivar
						</Button>
					</>
				) : (
					<Button type="button" disabled={busy} onClick={handleEnable}>
						Activar push
					</Button>
				)}
			</div>
		</div>
	);
}
