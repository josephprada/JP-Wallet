import { BrandLogoMark } from "@app/components/brand/BrandLogoMark";
import { PushPermissionBanner } from "@app/components/notifications/PushPermissionBanner";
import { ApiAccessSection } from "@app/components/settings/ApiAccessSection";
import { AppearanceSection } from "@app/components/settings/AppearanceSection";
import { BalanceEditToggle } from "@app/components/settings/BalanceEditToggle";
import { GroupingPicker } from "@app/components/settings/GroupingPicker";
import { LanguagePicker } from "@app/components/settings/LanguagePicker";
import { NotificationsToggle } from "@app/components/settings/NotificationsToggle";
import { PreferenceRow } from "@app/components/settings/PreferenceRow";
import { ProfileEditor } from "@app/components/settings/ProfileEditor";
import { useAuth } from "@app/lib/auth/useAuth";
import { usePreferencesStore } from "@app/stores/preferences";
import { Button } from "@jp-ds";
import { GROUPING_LABELS, THEME_MODE_LABELS } from "@jp-ds/index";
import { useState } from "react";
import { useNavigate } from "react-router";

export function SettingsRoute() {
	const { session, signOut } = useAuth();
	const navigate = useNavigate();
	const [groupingOpen, setGroupingOpen] = useState(false);
	const [languageOpen, setLanguageOpen] = useState(false);

	const mode = usePreferencesStore((s) => s.mode);
	const defaultGrouping = usePreferencesStore((s) => s.defaultGrouping);

	const handleSignOut = async () => {
		await signOut();
		navigate("/login", { replace: true });
	};

	return (
		<div className="animate-stagger">
			<div className="page-header animate-stagger-item">
				<div className="dash-header__brand show-desktop">
					<BrandLogoMark size={42} />
					<div>
						<h1 className="page-title">Ajustes</h1>
						<p className="page-subtitle">Preferencias de la aplicación</p>
					</div>
				</div>
				<div className="page-header__mobile show-mobile">
					<BrandLogoMark size={28} />
					<h1 className="page-title">Ajustes</h1>
				</div>
			</div>

			<div className="card-stagger settings-sections">
				<section className="settings-section">
					<h2 className="settings-section__title">Perfil</h2>
					<ProfileEditor />
				</section>

				<AppearanceSection />

				<section className="settings-section">
					<h2 className="settings-section__title">Preferencias</h2>
					<div className="settings-card glass">
						<PreferenceRow
							title="Agrupación"
							subtitle="Período por defecto del resumen"
							value={GROUPING_LABELS[defaultGrouping]}
							onClick={() => setGroupingOpen(true)}
						/>
						<PreferenceRow
							title="Idioma"
							subtitle="Interfaz de la aplicación"
							value="Español"
							onClick={() => setLanguageOpen(true)}
						/>
						<PreferenceRow
							title="Modo"
							subtitle="Tema visual actual"
							value={THEME_MODE_LABELS[mode]}
							as="div"
						/>
						<div className="settings-row glass">
							<NotificationsToggle />
						</div>
						<PushPermissionBanner />
					</div>
				</section>

				<ApiAccessSection />

				<section className="settings-section">
					<h2 className="settings-section__title">Emergencia</h2>
					<div className="settings-card glass">
						<div className="settings-row glass">
							<BalanceEditToggle />
						</div>
					</div>
				</section>

				{session ? (
					<div
						className="settings-sign-out show-mobile"
						style={{ marginTop: "var(--space-6)" }}
					>
						<Button variant="secondary" fullWidth onClick={handleSignOut}>
							Cerrar sesión
						</Button>
					</div>
				) : null}
			</div>

			<GroupingPicker
				open={groupingOpen}
				onClose={() => setGroupingOpen(false)}
			/>
			<LanguagePicker
				open={languageOpen}
				onClose={() => setLanguageOpen(false)}
			/>
		</div>
	);
}
