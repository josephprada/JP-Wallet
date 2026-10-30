import { useAuthActions } from "@convex-dev/auth/react";
import { Button, Input } from "@jp-ds/index";
import { useState } from "react";

/**
 * Login directo para pruebas locales (redes que bloquean Google OAuth).
 * Solo se renderiza con `vite dev` y requiere `DEV_LOGIN_SECRET` en la
 * deployment de Convex (ver convex/devLogin.ts).
 */
export function DevLoginForm() {
	const { signIn } = useAuthActions();
	const [email, setEmail] = useState("");
	const [secret, setSecret] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setPending(true);
		setError(null);
		try {
			await signIn("dev-login", { email: email.trim(), secret });
		} catch {
			setError(
				"Login de prueba rechazado: revisa el correo, el secreto y que DEV_LOGIN_SECRET esté en la deployment.",
			);
		} finally {
			setPending(false);
		}
	};

	return (
		<form
			className="animate-stagger-item"
			style={{ width: "100%", display: "grid", gap: "var(--space-2)" }}
			onSubmit={handleSubmit}
		>
			<p className="legal">Solo desarrollo · login directo</p>
			<Input
				label="Correo (usuario existente)"
				type="email"
				autoComplete="username"
				value={email}
				onChange={(e) => setEmail(e.target.value)}
				required
			/>
			<Input
				label="DEV_LOGIN_SECRET"
				type="password"
				autoComplete="current-password"
				value={secret}
				onChange={(e) => setSecret(e.target.value)}
				required
			/>
			<Button type="submit" variant="secondary" fullWidth disabled={pending}>
				Entrar (dev)
			</Button>
			{error ? (
				<p className="legal" style={{ color: "var(--color-danger)" }}>
					{error}
				</p>
			) : null}
		</form>
	);
}
