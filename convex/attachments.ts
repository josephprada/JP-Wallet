import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	type MutationCtx,
	internalMutation,
	mutation,
	query,
} from "./_generated/server";
import {
	assertTaxDocumentEditable,
	requireAttachmentOwnership,
	requireTaxItemOwnership,
	requireTransactionOwnership,
	requireUserId,
} from "./lib/auth";
import {
	MAX_ATTACHMENTS_PER_TAX_ITEM,
	MAX_ATTACHMENTS_PER_TRANSACTION,
	MAX_ATTACHMENT_SIZE,
	MAX_PENDING_UPLOADS_PER_USER,
	PENDING_UPLOAD_TTL_MS,
	mimeTypeValidator,
	sanitizeAttachmentFilename,
	validateMimeType,
} from "./lib/validators";

export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const pending = await ctx.db
			.query("pendingUploads")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const now = Date.now();
		const active = pending.filter(
			(row) => now - row.createdAt < PENDING_UPLOAD_TTL_MS,
		);
		if (active.length >= MAX_PENDING_UPLOADS_PER_USER) {
			throw new Error("Too many pending uploads; try again later");
		}
		await ctx.db.insert("pendingUploads", { userId, createdAt: now });
		return await ctx.storage.generateUploadUrl();
	},
});

export const listByTransaction = query({
	args: {
		transactionId: v.id("transactions"),
	},
	handler: async (ctx, { transactionId }) => {
		const userId = await requireUserId(ctx);
		const transaction = await ctx.db.get(transactionId);
		if (!transaction || transaction.userId !== userId) {
			return [];
		}

		return await ctx.db
			.query("attachments")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", "transaction").eq("entityId", transactionId),
			)
			.collect();
	},
});

export const listByTaxItem = query({
	args: {
		taxItemId: v.id("taxItems"),
	},
	handler: async (ctx, { taxItemId }) => {
		const userId = await requireUserId(ctx);
		const item = await ctx.db.get(taxItemId);
		if (!item || item.userId !== userId) {
			return [];
		}

		return await ctx.db
			.query("attachments")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", "taxItem").eq("entityId", taxItemId),
			)
			.collect();
	},
});

async function assertStorageAvailable(
	ctx: MutationCtx,
	storageId: Id<"_storage">,
): Promise<{ mimeType: "image/jpeg" | "image/png" | "application/pdf"; size: number }> {
	const metadata = await ctx.storage.getMetadata(storageId);
	if (!metadata?.contentType) {
		throw new Error("Invalid storage file");
	}
	const mimeType = validateMimeType(metadata.contentType);
	if (metadata.size > MAX_ATTACHMENT_SIZE) {
		throw new Error("File exceeds 10 MB limit");
	}

	const claimed = await ctx.db
		.query("attachments")
		.withIndex("by_storage", (q) => q.eq("storageId", storageId))
		.first();
	if (claimed) {
		throw new Error("Storage file already attached");
	}

	return { mimeType, size: metadata.size };
}

export const create = mutation({
	args: {
		transactionId: v.id("transactions"),
		storageId: v.id("_storage"),
		filename: v.string(),
		mimeType: mimeTypeValidator,
		size: v.number(),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		await requireTransactionOwnership(ctx, userId, args.transactionId);

		const { mimeType, size } = await assertStorageAvailable(ctx, args.storageId);

		const existing = await ctx.db
			.query("attachments")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", "transaction").eq("entityId", args.transactionId),
			)
			.collect();

		if (existing.length >= MAX_ATTACHMENTS_PER_TRANSACTION) {
			throw new Error("Maximum 5 attachments per transaction");
		}

		return await ctx.db.insert("attachments", {
			userId,
			entityType: "transaction",
			entityId: args.transactionId,
			storageId: args.storageId,
			filename: sanitizeAttachmentFilename(args.filename),
			mimeType,
			size,
			uploadedAt: Date.now(),
		});
	},
});

export const createForTaxItem = mutation({
	args: {
		taxItemId: v.id("taxItems"),
		storageId: v.id("_storage"),
		filename: v.string(),
		mimeType: mimeTypeValidator,
		size: v.number(),
	},
	handler: async (ctx, args) => {
		const userId = await requireUserId(ctx);
		const item = await requireTaxItemOwnership(ctx, userId, args.taxItemId);
		await assertTaxDocumentEditable(ctx, userId, item.documentId);

		const { mimeType, size } = await assertStorageAvailable(ctx, args.storageId);

		const existing = await ctx.db
			.query("attachments")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", "taxItem").eq("entityId", args.taxItemId),
			)
			.collect();

		if (existing.length >= MAX_ATTACHMENTS_PER_TAX_ITEM) {
			throw new Error("Maximum 5 attachments per tax item");
		}

		return await ctx.db.insert("attachments", {
			userId,
			entityType: "taxItem",
			entityId: args.taxItemId,
			storageId: args.storageId,
			filename: sanitizeAttachmentFilename(args.filename),
			mimeType,
			size,
			uploadedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: {
		attachmentId: v.id("attachments"),
	},
	handler: async (ctx, { attachmentId }) => {
		const userId = await requireUserId(ctx);
		const attachment = await requireAttachmentOwnership(
			ctx,
			userId,
			attachmentId,
		);

		if (attachment.entityType === "taxItem") {
			const taxItem = await ctx.db.get(
				attachment.entityId as Id<"taxItems">,
			);
			if (taxItem) {
				await assertTaxDocumentEditable(ctx, userId, taxItem.documentId);
			}
		}

		await ctx.storage.delete(attachment.storageId);
		await ctx.db.delete(attachmentId);

		return null;
	},
});

export const getUrl = query({
	args: {
		storageId: v.id("_storage"),
	},
	handler: async (ctx, { storageId }) => {
		const userId = await requireUserId(ctx);
		const owned = await ctx.db
			.query("attachments")
			.withIndex("by_storage", (q) => q.eq("storageId", storageId))
			.first();
		if (!owned || owned.userId !== userId) {
			return null;
		}

		return await ctx.storage.getUrl(storageId);
	},
});

/** Limpia bookkeeping de pendingUploads expirados (no borra blobs huérfanos). */
export const cleanupExpiredPendingUploads = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - PENDING_UPLOAD_TTL_MS;
		const expired = await ctx.db
			.query("pendingUploads")
			.withIndex("by_created", (q) => q.lt("createdAt", cutoff))
			.take(200);
		for (const row of expired) {
			await ctx.db.delete(row._id);
		}
		return { deleted: expired.length };
	},
});
