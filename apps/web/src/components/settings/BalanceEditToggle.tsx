import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

/**
 * Modo emergencia: habilita la corrección manual del saldo de las cuentas.
 * Se lee/escribe directo en servidor porque `accounts.adjustBalance` lo valida.
 */
export function BalanceEditToggle() {
	const prefs = useQuery(api.userPreferences.get);
	const updatePreferences = useMutation(api.userPreferences.update);
	const [saving, setSaving] = useState(false);
	const enabled = prefs?.balanceEditEnabled ?? false;

	const toggle = async () => {
		setSaving(true);
		try {
			await updatePreferences({ balanceEditEnabled: !enabled });
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="notifications-row">
			<div>
				<div className="settings-row__title">Editar saldos de cuentas</div>
				<div className="settings-row__sub">
					{enabled
						? "Activo: puedes corregir el saldo actual desde Editar cuenta. Desactívalo al terminar."
						: "Úsalo solo si una cuenta quedó descuadrada por un error. No crea movimientos."}
				</div>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={enabled}
				aria-label={
					enabled
						? "Desactivar edición de saldos de emergencia"
						: "Activar edición de saldos de emergencia"
				}
				className={`toggle-switch${enabled ? " toggle-switch--on" : ""}`}
				disabled={prefs === undefined || saving}
				onClick={toggle}
			>
				<span className="toggle-switch__thumb" />
			</button>
		</div>
	);
}
