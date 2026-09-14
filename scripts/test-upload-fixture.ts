import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import type { UploadPurpose } from "../convex/uploadPolicy";

/** Tests seed the same receipt required in production; no auth bypass in runtime code. */
export async function seedUploadReceipt(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  owner: { userId?: Id<"users">; companyId?: Id<"companies">; threadId?: Id<"threads"> },
  purpose: UploadPurpose,
) {
  return ctx.db.insert("uploadReservations", {
    ...owner, purpose, storageId, state: "READY", maxBytes: 50 * 1024 ** 2,
    tokenDigest: crypto.randomUUID(), createdAt: Date.now(), expiresAt: Date.now() + 86_400_000,
  });
}
