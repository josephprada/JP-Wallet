import { BrandLogoMark } from "@app/components/brand/BrandLogoMark";
import { MonthSwitcher } from "@app/components/dashboard/MonthSwitcher";
import { TransactionList } from "@app/components/transactions/TransactionList";
import { ConfirmDialog } from "@app/components/ui/ConfirmDialog";
import { useReconcileFixedExpensePayments } from "@app/lib/budgets/useReconcileFixedExpensePayments";
import { addMonths, monthRange } from "@app/lib/format/date";
import { useTransactionModalStore } from "@app/stores/transactionModal";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Input } from "@jp-ds";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

type TypeTab = "all" | "income" | "expense" | "transfer";

const typeTabs: { value: TypeTab; label: string }[] = [
	{ value: "all", label: "Todos" },
	{ value: "income", label: "Ingresos" },
	{ value: "expense", label: "Gastos" },
	{ value: "transfer", label: "Transferencias" },
];

export function TransactionsRoute() {
	useReconcileFixedExpensePayments();
	const [searchParams] = useSearchParams();
	const paramId = searchParams.get("id") as Id<"transactions"> | null;
	const openCreate = useTransactionModalStore((state) => state.openCreate);
	const openEdit = useTransactionModalStore((state) => state.openEdit);

	const [search, setSearch] = useState("");
	const [typeTab, setTypeTab] = useState<TypeTab>("all");
	const [month, setMonth] = useState(() => new Date());
	const range = monthRange(month);

	const listArgs = useMemo(
		() => ({
			dateFrom: range.start,
			dateTo: range.end,
			includeExcludedAccounts: true,
			...(search.trim() ? { search: search.trim() } : {}),
		}),
		[range.start, range.end, search],
	);

	const allTransactions = useQuery(api.transactions.list, listArgs) ?? [];
	const deepLinkedTx = useQuery(
		api.transactions.get,
		paramId ? { transactionId: paramId } : "skip",
	);
	const transactions =
		typeTab === "all"
			? allTransactions
			: allTransactions.filter((t) => t.type === typeTab);

	const removeTx = useMutation(api.transactions.remove);
	const reorderTx = useMutation(api.transactions.reorderWithinDate);

	const [deletingId, setDeletingId] = useState<Id<"transactions"> | null>(null);
	const handledDeepLinkRef = useRef<string | null>(null);

	useEffect(() => {
		if (!paramId) {
			handledDeepLinkRef.current = null;
			return;
		}
		if (deepLinkedTx === undefined) return;
		if (handledDeepLinkRef.current === paramId) return;

		handledDeepLinkRef.current = paramId;
		if (!deepLinkedTx) return;
		setMonth(new Date(deepLinkedTx.date));
		setTypeTab("all");
		openEdit(paramId);
	}, [paramId, deepLinkedTx, openEdit]);

	const handleDelete = async () => {
		if (!deletingId) return;
		await removeTx({ transactionId: deletingId });
		setDeletingId(null);
	};

	const handleReorder = async (draggedId: string, targetId: string) => {
		const dragged = allTransactions.find((t) => t._id === draggedId);
		const target = allTransactions.find((t) => t._id === targetId);
		if (!dragged || !target || dragged.date !== target.date) return;

		const sameDate = allTransactions.filter((t) => t.date === dragged.date);
		const ids = sameDate.map((t) => t._id);
		const fromIdx = ids.indexOf(draggedId as Id<"transactions">);
		const toIdx = ids.indexOf(targetId as Id<"transactions">);
		if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

		const reordered = [...ids];
		const [item] = reordered.splice(fromIdx, 1);
		reordered.splice(toIdx, 0, item);

		await reorderTx({
			date: dragged.date,
			orderedIds: reordered as Id<"transactions">[],
		});
	};

	return (
		<div className="animate-stagger">
			<div className="page-header animate-stagger-item">
				<div className="dash-header__brand show-desktop">
					<BrandLogoMark size={42} />
					<div>
						<h1 className="page-title">Movimientos</h1>
						<p className="page-subtitle">
							Historial de tu actividad financiera
						</p>
					</div>
				</div>
				<div className="page-header__mobile show-mobile">
					<BrandLogoMark size={28} />
					<h1 className="page-title">Movimientos</h1>
				</div>
				<div className="page-header__controls">
					<div className="show-mobile">
						<MonthSwitcher
							month={month}
							onPrev={() => setMonth((m) => addMonths(m, -1))}
							onNext={() => setMonth((m) => addMonths(m, 1))}
							compact
						/>
					</div>
					<div className="show-desktop">
						<MonthSwitcher
							month={month}
							onPrev={() => setMonth((m) => addMonths(m, -1))}
							onNext={() => setMonth((m) => addMonths(m, 1))}
						/>
					</div>
				</div>
			</div>

			<div className="tx-toolbar animate-stagger-item">
				<Input
					className="tx-search"
					placeholder="Buscar movimientos"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
			</div>

			<div
				className="chips-row animate-stagger-item"
				role="tablist"
				aria-label="Filtrar por tipo"
			>
				{typeTabs.map((tab) => (
					<button
						key={tab.value}
						type="button"
						role="tab"
						aria-selected={typeTab === tab.value}
						className={`chip${typeTab === tab.value ? " chip--active" : ""}`}
						onClick={() => setTypeTab(tab.value)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<TransactionList
				transactions={transactions}
				reorderSource={allTransactions}
				onCreate={() => openCreate("expense")}
				onEdit={(id) => openEdit(id as Id<"transactions">)}
				onDelete={(id) => setDeletingId(id as Id<"transactions">)}
				onReorder={handleReorder}
			/>

			<ConfirmDialog
				open={deletingId !== null}
				title="Eliminar movimiento"
				description="¿Eliminar este movimiento? Se revertirá el saldo de las cuentas afectadas."
				confirmLabel="Eliminar"
				variant="danger"
				onConfirm={handleDelete}
				onCancel={() => setDeletingId(null)}
			/>
		</div>
	);
}
