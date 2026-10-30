import { CategoryIcon } from "@app/lib/core/categoryIcon";
import { CoreIcon } from "@app/lib/core/icons";
import { formatShortDate } from "@app/lib/format/date";
import { IconButton } from "@jp-ds";
import { TransactionAmount } from "./TransactionAmount";
import type { TransactionItem } from "./TransactionList";

type TransactionRowProps = {
	tx: TransactionItem;
	variant?: "default" | "dashboard";
	draggable?: boolean;
	isDragging?: boolean;
	isDropTarget?: boolean;
	onDragStart?: (event: React.DragEvent<HTMLLIElement>) => void;
	onDragOver?: (event: React.DragEvent<HTMLLIElement>) => void;
	onDrop?: (event: React.DragEvent<HTMLLIElement>) => void;
	onDragEnd?: () => void;
	onSelect?: (id: string) => void;
	onDelete?: (id: string) => void;
};

export function TransactionRow({
	tx,
	variant = "default",
	draggable = false,
	isDragging = false,
	isDropTarget = false,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	onSelect,
	onDelete,
}: TransactionRowProps) {
	const accountLabel =
		tx.type === "transfer"
			? `${tx.accountName} → ${tx.toAccountName ?? ""}`
			: tx.accountName;

	const showNotesInTitle = Boolean(tx.destinationName && tx.notes?.trim());

	const metaParts =
		variant === "dashboard"
			? [
					formatShortDate(tx.date),
					accountLabel,
					showNotesInTitle ? null : tx.notes?.trim() || null,
				]
			: [
					formatShortDate(tx.date),
					tx.type === "transfer"
						? accountLabel
						: tx.destinationName
							? tx.accountName
							: `${tx.accountName} · ${tx.categoryName}`,
					showNotesInTitle ? null : tx.notes?.trim() || null,
				];

	const metaLine = [
		...metaParts,
		tx.excludedFromPersonalFinance ? "Excluida de finanzas" : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<li
			className={[
				"tx-row",
				draggable ? "tx-row--draggable" : "",
				onSelect ? "tx-row--selectable" : "",
				isDragging ? "tx-row--dragging" : "",
				isDropTarget ? "tx-row--drop-target" : "",
			]
				.filter(Boolean)
				.join(" ")}
			draggable={draggable}
			onClick={onSelect ? () => onSelect(tx._id) : undefined}
			onKeyDown={
				onSelect
					? (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onSelect(tx._id);
							}
						}
					: undefined
			}
			role={onSelect ? "button" : undefined}
			tabIndex={onSelect ? 0 : undefined}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragLeave={() => undefined}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
		>
			<span
				className="tx-row__icon"
				style={{
					backgroundColor: `${tx.categoryColor ?? "#7F8C8D"}22`,
					color: tx.categoryColor ?? "var(--color-text-secondary)",
				}}
				aria-hidden
			>
				<CategoryIcon
					icon={tx.categoryIcon}
					size={18}
					color={tx.categoryColor ?? "var(--color-text-secondary)"}
				/>
			</span>
			<div className="tx-row__body">
				<span className="tx-row__title">
					{tx.type === "transfer"
						? "Transferencia"
						: tx.destinationName
							? `${tx.categoryName}${tx.notes?.trim() ? ` - ${tx.notes.trim()}` : ""} · ${tx.destinationName}`
							: tx.categoryName}
				</span>
				<span className="tx-row__meta">{metaLine}</span>
			</div>
			<TransactionAmount type={tx.type} amount={tx.amount} />
			{onDelete ? (
				<div
					className="tx-row__actions"
					onMouseDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<IconButton
						aria-label="Eliminar movimiento"
						onClick={() => onDelete(tx._id)}
					>
						<CoreIcon name="trash" size={16} />
					</IconButton>
				</div>
			) : null}
		</li>
	);
}
