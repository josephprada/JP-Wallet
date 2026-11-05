export const DEFAULT_VAPID_SUBJECT = "mailto:support@wallet.lavalex.co";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * web-push exige que el subject VAPID sea `mailto:...` o una URL `https:`.
 * Un correo sin prefijo (error común al configurar la env) hace que
 * `setVapidDetails` lance y el envío falle con "Server Error".
 * Devuelve null si el valor no se puede corregir.
 */
export function normalizeVapidSubject(raw: string | undefined): string | null {
	const value = (raw ?? "").trim().replace(/^["']|["']$/g, "").trim();
	if (!value) return DEFAULT_VAPID_SUBJECT;
	if (value.startsWith("mailto:") || value.startsWith("https://")) return value;
	if (EMAIL.test(value)) return `mailto:${value}`;
	return null;
}
