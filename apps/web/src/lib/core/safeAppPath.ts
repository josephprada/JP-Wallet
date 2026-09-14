/**
 * Allowlist for in-app deep links from push / notifications.
 * Only same-origin relative paths; reject schemes and protocol-relative URLs.
 */
export function isSafeAppPath(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed.startsWith("/")) return false;
	if (trimmed.startsWith("//")) return false;
	if (trimmed.includes("://")) return false;
	if (trimmed.includes("\\")) return false;
	return true;
}

/** Returns a safe app path or fallback `/`. */
export function sanitizeAppPath(url: string | undefined | null): string {
	if (typeof url !== "string" || !isSafeAppPath(url)) return "/";
	return url.trim();
}
