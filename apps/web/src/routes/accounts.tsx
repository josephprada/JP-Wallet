import { AccountForm } from "@app/components/accounts/AccountForm";
import { AccountList } from "@app/components/accounts/AccountList";
import { BrandLogoMark } from "@app/components/brand/BrandLogoMark";
import { DashboardBalanceCard } from "@app/components/dashboard/DashboardBalanceCard";
import { MetricCard } from "@app/components/dashboard/MetricCard";
import { ConfirmDialog } from "@app/components/ui/ConfirmDialog";
import { EmptyState } from "@app/components/ui/EmptyState";
import { Modal } from "@app/components/ui/Modal";
import { CoreIcon } from "@app/lib/core/icons";
import type { AccountType } from "@app/lib/core/types";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Button, IconButton } from "@jp-ds";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

export function AccountsRoute() {
	const accounts =
		useQuery(api.accounts.list, { includeArchived: false }) ?? [];
	const createAccount = useMutation(api.accounts.create);
	const updateAccount = useMutation(api.accounts.update);
	const adjustBalance = useMutation(api.accounts.adjustBalance);
	const preferences = useQuery(api.userPreferences.get);
	const balanceEditEnabled = preferences?.balanceEditEnabled ?? false;
	const archiveAccount = useMutation(api.accounts.archive);
	const reorderAccounts = useMutation(api.accounts.reorder);

	const [mode, setMode] = useState<"closed" | "create" | "edit">("closed");
	const [editing, setEditing] = useState<Doc<"accounts"> | null>(null);
	const [archiving, setArchiving] = useState<Doc<"accounts"> | null>(null);
	const [loading, setLoading] = useState(false);

	const personalAccounts = accounts.filter(
		(a) =>
			a.excludeFromPersonalFinance !== true &&
			!(a.excludeFromPersonalFinance === undefined && a.isCreditEscrow),
	);
	const disponible = personalAccounts
		.filter((a) => a.type !== "credit")
		.reduce((s, a) => s + a.balance, 0);
	const credito = personalAccounts
		.filter((a) => a.type === "credit")
		.reduce((s, a) => s + a.balance, 0);
	// «Balance total» del header = disponible (sin deudas tipo crédito).
	const totalBalance = disponible;

	const closeModal = () => {
		setMode("closed");
		setEditing(null);
	};

	const handleCreate = async (values: {
		name: string;
		type: AccountType;
		initialBalance?: number;
		excludeFromPersonalFinance: boolean;
	}) => {
		setLoading(true);
		try {
			await createAccount(values);
			closeModal();
		} finally {
			setLoading(false);
		}
	};

	const handleUpdate = async ({
		currentBalance,
		...values
	}: {
		name: string;
		type: AccountType;
		currentBalance?: number;
		excludeFromPersonalFinance: boolean;
	}) => {
		if (!editing) return;
		setLoading(true);
		try {
			await updateAccount({ accountId: editing._id, ...values });
			if (
				balanceEditEnabled &&
				currentBalance !== undefined &&
				currentBalance !== editing.balance
			) {
				await adjustBalance({
					accountId: editing._id,
					balance: currentBalance,
				});
			}
			closeModal();
		} finally {
			setLoading(false);
		}
	};

	const handleArchive = async () => {
		if (!archiving) return;
		await archiveAccount({ accountId: archiving._id });
		setArchiving(null);
		if (editing?._id === archiving._id) closeModal();
	};

	const handleReorder = async (draggedId: string, targetId: string) => {
		const ids = accounts.map((account) => account._id);
		const fromIdx = ids.indexOf(draggedId as Id<"accounts">);
		const toIdx = ids.indexOf(targetId as Id<"accounts">);
		if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

		const reordered = [...ids];
		const [item] = reordered.splice(fromIdx, 1);
		reordered.splice(toIdx, 0, item);

		await reorderAccounts({ orderedIds: reordered });
	};

	return (
		<div className="animate-stagger">
			<div className="page-header animate-stagger-item">
				<div className="dash-header__brand show-desktop">
					<BrandLogoMark size={42} />
					<div>
						<h1 className="page-title">Cuentas</h1>
						<p className="page-subtitle">
							Gestiona tus saldos y transferencias
						</p>
					</div>
				</div>
				<div className="page-header__mobile show-mobile">
					<BrandLogoMark size={28} />
					<h1 className="page-title">Cuentas</h1>
				</div>
				<div className="page-header__controls">
					<div className="page-header__actions show-desktop">
						<Button onClick={() => setMode("create")}>
							<CoreIcon name="plus" size={16} /> Nueva cuenta
						</Button>
					</div>
					<div className="page-header__actions show-mobile">
						<IconButton
							aria-label="Nueva cuenta"
							onClick={() => setMode("create")}
						>
							<CoreIcon name="plus" size={20} />
						</IconButton>
					</div>
				</div>
			</div>

			{accounts.length === 0 ? (
				<EmptyState
					title="Sin cuentas"
					description="Crea tu primera cuenta para empezar a registrar movimientos."
					actionLabel="Crear cuenta"
					onAction={() => setMode("create")}
					icon={<CoreIcon name="wallet" size={32} />}
				/>
			) : (
				<>
					<div className="dash-metrics show-desktop card-stagger">
						<MetricCard label="Disponible" value={disponible} />
						<MetricCard label="Crédito usado" value={credito} tone="expense" />
					</div>

					<div className="show-mobile animate-stagger-item">
						<DashboardBalanceCard
							totalBalance={totalBalance}
							accountCount={accounts.length}
						/>
					</div>

					<h2
						className="section-title animate-stagger-item"
						style={{ marginTop: "var(--space-4)" }}
					>
						Tus cuentas
					</h2>
					<AccountList
						accounts={accounts}
						onCreate={() => setMode("create")}
						onEdit={(account) => {
							setEditing(account);
							setMode("edit");
						}}
						onArchive={setArchiving}
						onReorder={handleReorder}
					/>
				</>
			)}

			<Modal
				open={mode !== "closed"}
				title={mode === "edit" ? "Editar cuenta" : "Nueva cuenta"}
				onClose={closeModal}
			>
				{mode === "edit" && editing ? (
					<AccountForm
						isEdit
						loading={loading}
						balanceEdit={
							balanceEditEnabled
								? { currentBalance: editing.balance }
								: undefined
						}
						initial={{
							name: editing.name,
							type: editing.type,
							excludeFromPersonalFinance:
								editing.excludeFromPersonalFinance ??
								editing.isCreditEscrow === true,
						}}
						onSubmit={handleUpdate}
						onCancel={closeModal}
						onDelete={() => setArchiving(editing)}
					/>
				) : (
					<AccountForm
						loading={loading}
						onSubmit={handleCreate}
						onCancel={closeModal}
					/>
				)}
			</Modal>

			<ConfirmDialog
				open={archiving !== null}
				title="Archivar cuenta"
				description={`¿Archivar "${archiving?.name}"? No aparecerá en nuevos movimientos, pero conservará su historial.`}
				confirmLabel="Archivar"
				variant="danger"
				onConfirm={handleArchive}
				onCancel={() => setArchiving(null)}
			/>
		</div>
	);
}
