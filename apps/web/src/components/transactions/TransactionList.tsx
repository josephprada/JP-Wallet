import { EmptyState } from "@app/components/ui/EmptyState";
import { CategoryIcon } from "@app/lib/core/categoryIcon";
import { CoreIcon } from "@app/lib/core/icons";
import { formatShortDate } from "@app/lib/format/date";
import { IconButton } from "@jp-ds";
import { useMemo, useRef, useState } from "react";
import { TransactionAmount } from "./TransactionAmount";
import { TransactionRow } from "./TransactionRow";

export type TransactionItem = {
	_id: string;
	type: "income" | "expense" | "transfer";
	amount: number;
	date: number;
	accountName: string;
	toAccountName?: string;
	categoryName: string;
	categoryIcon: string;
	categoryColor?: string;
	destinationName?: string;
	notes?: string;
	/** Cuenta excluida de finanzas personales: visible pero fuera de totales. */
	excludedFromPersonalFinance?: boolean;
};

type TransactionListProps = {
	transactions: TransactionItem[];
	reorderSource?: TransactionItem[];
	onEdit?: (id: string) => void;
	onDelete?: (id: string) => void;
	onCreate?: () => void;
	onReorder?: (draggedId: string, targetId: string) => void;
};

function dayLabel(timestamp: number): string {
	const today = new Date();
	const date = new Date(timestamp);
	const startToday = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	).getTime();
	const dayMs = 86400000;
	const startDate = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	).getTime();

	if (startDate === startToday) return "Hoy";
	if (startDate === startToday - dayMs) return "Ayer";
	return date.toLocaleDateString("es-CO", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

function groupByDay(transactions: TransactionItem[]) {
	const groups: { label: string; items: TransactionItem[] }[] = [];
	for (const tx of transactions) {
		const label = dayLabel(tx.date);
		const last = groups[groups.length - 1];
		if (last && last.label === label) {
			last.items.push(tx);
		} else {
			groups.push({ label, items: [tx] });
		}
	}
	return groups;
}

export function TransactionList({
	transactions,
	reorderSource,
	onEdit,
	onDelete,
	onCreate,
	onReorder,
}: TransactionListProps) {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTargetId, setDropTargetId] = useState<string | null>(null);
	const suppressClickRef = useRef(false);

	const handleOpen = (id: string) => {
		if (suppressClickRef.current) return;
		onEdit?.(id);
	};

	const reorderableDateCounts = useMemo(() => {
		const source = reorderSource ?? transactions;
		const counts = new Map<number, number>();
		for (const tx of source) {
			counts.set(tx.date, (counts.get(tx.date) ?? 0) + 1);
		}
		return counts;
	}, [reorderSource, transactions]);

	const canReorder = (tx: TransactionItem) =>
		Boolean(onReorder) && (reorderableDateCounts.get(tx.date) ?? 0) > 1;

	const handleDragStart = (
		event: React.DragEvent<HTMLTableRowElement | HTMLLIElement>,
		tx: TransactionItem,
	) => {
		if (!canReorder(tx)) {
			event.preventDefault();
			return;
		}
		setDraggingId(tx._id);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", tx._id);
	};

	const startDrag = (
		event: React.DragEvent<HTMLTableRowElement | HTMLLIElement>,
		tx: TransactionItem,
	) => {
		if ((event.target as HTMLElement).closest(".tx-row__actions")) {
			event.preventDefault();
			return;
		}
		handleDragStart(event, tx);
	};

	const handleDragOver = (
		event: React.DragEvent<HTMLTableRowElement | HTMLLIElement>,
		tx: TransactionItem,
	) => {
		if (!draggingId || draggingId === tx._id || !canReorder(tx)) return;

		const source = reorderSource ?? transactions;
		const dragged = source.find((item) => item._id === draggingId);
		if (!dragged || dragged.date !== tx.date) return;

		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		setDropTargetId(tx._id);
	};

	const handleDrop = (
		event: React.DragEvent<HTMLTableRowElement | HTMLLIElement>,
		tx: TransactionItem,
	) => {
		event.preventDefault();
		if (!draggingId || draggingId === tx._id) return;

		const source = reorderSource ?? transactions;
		const dragged = source.find((item) => item._id === draggingId);
		if (!dragged || dragged.date !== tx.date) return;

		onReorder?.(draggingId, tx._id);
		setDraggingId(null);
		setDropTargetId(null);
	};

	const handleDragEnd = () => {
		suppressClickRef.current = true;
		requestAnimationFrame(() => {
			suppressClickRef.current = false;
		});
		setDraggingId(null);
		setDropTargetId(null);
	};

	if (transactions.length === 0) {
		return (
			<EmptyState
				title="Sin movimientos"
				description="No hay movimientos en este mes con los filtros actuales."
				actionLabel={onCreate ? "Nuevo movimiento" : undefined}
				onAction={onCreate}
				icon={<CoreIcon name="arrow-down-up" size={32} />}
			/>
		);
	}

	const groups = groupByDay(transactions);

	return (
		<>
			<div className="tx-list-mobile">
				{groups.map((group) => (
					<div key={group.label} className="tx-group">
						<h3 className="tx-group__label">{group.label}</h3>
						<ul className="tx-rows card-stagger">
							{group.items.map((tx) => (
								<TransactionRow
									key={tx._id}
									tx={tx}
									draggable={canReorder(tx)}
									isDragging={draggingId === tx._id}
									isDropTarget={dropTargetId === tx._id}
									onDragStart={(event) => startDrag(event, tx)}
									onDragOver={(event) => handleDragOver(event, tx)}
									onDrop={(event) => handleDrop(event, tx)}
									onDragEnd={handleDragEnd}
									onSelect={onEdit ? handleOpen : undefined}
									onDelete={onDelete}
								/>
							))}
						</ul>
					</div>
				))}
			</div>

			<div className="tx-table-desktop glass">
				<table>
					<colgroup>
						<col />
						<col className="tx-table__col-account" />
						<col className="tx-table__col-date" />
						<col className="tx-table__col-amount" />
						<col className="tx-table__col-actions" />
					</colgroup>
					<thead>
						<tr>
							<th>Movimiento</th>
							<th>Cuenta</th>
							<th>Fecha</th>
							<th className="tx-table__amount-col">Monto</th>
							<th className="tx-table__actions-col" aria-label="Acciones" />
						</tr>
					</thead>
					<tbody className="card-stagger">
						{transactions.map((tx) => (
							<tr
								key={tx._id}
								draggable={canReorder(tx)}
								className={[
									canReorder(tx) ? "tx-table__row--draggable" : "",
									onEdit ? "tx-table__row--selectable" : "",
									draggingId === tx._id ? "tx-table__row--dragging" : "",
									dropTargetId === tx._id ? "tx-table__row--drop-target" : "",
								]
									.filter(Boolean)
									.join(" ")}
								onClick={() => handleOpen(tx._id)}
								onKeyDown={
									onEdit
										? (event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													handleOpen(tx._id);
												}
											}
										: undefined
								}
								role={onEdit ? "button" : undefined}
								tabIndex={onEdit ? 0 : undefined}
								onDragStart={(event) => startDrag(event, tx)}
								onDragOver={(event) => handleDragOver(event, tx)}
								onDragLeave={() => {
									if (dropTargetId === tx._id) setDropTargetId(null);
								}}
								onDrop={(event) => handleDrop(event, tx)}
								onDragEnd={handleDragEnd}
							>
									<td>
										<div className="tx-table__movement">
											<span
												className="tx-row__icon tx-row__icon--sm"
												style={{
													backgroundColor: `${tx.categoryColor ?? "#7F8C8D"}22`,
													color:
														tx.categoryColor ?? "var(--color-text-secondary)",
												}}
												aria-hidden
											>
												<CategoryIcon
													icon={tx.categoryIcon}
													size={16}
													color={
														tx.categoryColor ?? "var(--color-text-secondary)"
													}
												/>
											</span>
											<span>
												{tx.type === "transfer"
													? "Transferencia"
													: (
														<>
															{tx.categoryName}
															{tx.destinationName && tx.notes
																? ` - ${tx.notes}`
																: null}
															{tx.destinationName ? (
																<span className="tx-table__rubro">
																	{" "}
																	· {tx.destinationName}
																</span>
															) : null}
															{!tx.destinationName && tx.notes ? (
																<span className="tx-table__note">
																	{" "}
																	· {tx.notes}
																</span>
															) : null}
														</>
													)}
											</span>
										</div>
									</td>
									<td>
										{tx.type === "transfer"
											? `${tx.accountName} → ${tx.toAccountName ?? ""}`
											: tx.accountName}
										{tx.excludedFromPersonalFinance ? (
											<span className="tx-table__note"> · Excluida</span>
										) : null}
									</td>
									<td>{formatShortDate(tx.date)}</td>
									<td className="tx-table__amount-col">
										<TransactionAmount type={tx.type} amount={tx.amount} />
									</td>
									<td className="tx-table__actions-col">
										{onDelete ? (
											<div
												className="tx-row__actions"
												onMouseDown={(event) => event.stopPropagation()}
												onClick={(event) => event.stopPropagation()}
											>
												<IconButton
													aria-label="Eliminar"
													onClick={() => onDelete(tx._id)}
												>
													<CoreIcon name="trash" size={16} />
												</IconButton>
											</div>
										) : null}
									</td>
								</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
