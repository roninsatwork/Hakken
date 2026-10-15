import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { readerFields, removeTranslations, requestTranslation } from "./contentTranslation";
import { superAdminMutation, superAdminQuery, type TenantMutationCtx } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  checkedTypeName,
  MOST_TYPE_NAME,
  MOST_TYPES,
  shippedType,
  typesFrom,
  type ClassificationTypeEntry,
} from "./utils/classificationTypes";
import type { AppLanguage } from "./utils/contentLanguages";

/**
 * The page types every company's classifications pick from — System Settings
 * → Classification (docs/plans/active/classification-types-plan.md). One list
 * for every company: a company names its own classifications, and the type is
 * the shared category Hakken's reports read, so it means the same on every
 * website. A type is one field, its name: the seven shipped keep the keys
 * reports read, and a type added here is counted on its own.
 *
 * - **The shipped seven** are written in code (`utils/classificationTypes.ts`)
 *   and need no row; editing one gives it a row of its own. With no rows at
 *   all everything reads as it always did.
 * - **An added type's key is its own id**: what its classifications hold.
 * - **Names are written once, in English** (CT7); each write asks the
 *   Translator, and a reader sees their language once it is made from the
 *   English as it stands.
 * - **Removing** is for an added type no classification uses, refused here as
 *   well as hidden on screen.
 */

type Reader = { db: QueryCtx["db"] };

/** Classifications counted per type on the list (CT8): past it the list says "300+". */
export const USES_COUNTED = 300;
/** Classifications read for one type's own page, to say how many use it and on how many websites. */
const USES_READ = 2_000;

/** The list as it stands: the shipped seven, as edited, then the added types, oldest first. */
export async function readClassificationTypes(ctx: Reader): Promise<ClassificationTypeEntry[]> {
  const rows = await ctx.db.query("classificationTypes").take(MOST_TYPES);
  return typesFrom(rows.map((row) => ({ _id: row._id, key: row.key, nameEn: row.nameEn, createdAt: row.createdAt })));
}

/** A type's name in the reader's language: a shipped name while it keeps it, else its English or the Translator's copy of it. */
async function nameIn(ctx: QueryCtx, type: ClassificationTypeEntry, language: string): Promise<string> {
  if (type.shippedName) return shippedType(type.key)?.names[language as AppLanguage] ?? type.nameEn;
  if (!type.rowId) return type.nameEn;
  return (await readerFields(ctx, "classificationTypes", type.rowId, { name: type.nameEn }, language)).name;
}

/** The classifications of one type across every company, up to `most`. */
async function usesOf(ctx: Reader, key: string, most: number) {
  return await ctx.db.query("pageClassifications").withIndex("by_type", (q) => q.eq("type", key)).take(most);
}

/** A classification's type, as a write takes it: refused when it is not in the list. */
export async function checkedClassificationType(ctx: Reader, key: string): Promise<string> {
  const types = await readClassificationTypes(ctx);
  if (!types.some((type) => type.key === key)) throw appError("INVALID_INPUT", "That type is no longer in the list. Choose another.");
  return key;
}

const choiceValidator = v.object({ key: v.string(), name: v.string() });

/** The types in the order they are offered, in the reader's language: a classification's Type dropdown and its list's Type column. */
export const classificationTypeChoices = superAdminQuery({
  args: { language: v.string() },
  returns: v.array(choiceValidator),
  handler: async (ctx, args) => {
    const types = await readClassificationTypes(ctx);
    return await Promise.all(types.map(async (type) => ({ key: type.key, name: await nameIn(ctx, type, args.language) })));
  },
});

/** System Settings → Classification: every type, and how many classifications use it. */
export const classificationTypeList = superAdminQuery({
  args: { language: v.string() },
  returns: v.object({
    types: v.array(v.object({
      key: v.string(),
      name: v.string(),
      builtIn: v.boolean(),
      /** Classifications using it, counted up to `counted`. */
      classifications: v.number(),
      /** True when more than `counted` use it. */
      more: v.boolean(),
    })),
    counted: v.number(),
    most: v.number(),
  }),
  handler: async (ctx, args) => {
    const types = await readClassificationTypes(ctx);
    const rows = await Promise.all(types.map(async (type) => {
      const uses = await usesOf(ctx, type.key, USES_COUNTED + 1);
      return {
        key: type.key,
        name: await nameIn(ctx, type, args.language),
        builtIn: type.builtIn,
        classifications: Math.min(uses.length, USES_COUNTED),
        more: uses.length > USES_COUNTED,
      };
    }));
    return { types: rows, counted: USES_COUNTED, most: MOST_TYPES };
  },
});

/** One type's own page: its English name to edit, and who uses it. Null when it is no longer in the list. */
export const classificationTypeDetail = superAdminQuery({
  args: { key: v.string() },
  returns: v.union(v.null(), v.object({
    key: v.string(),
    nameEn: v.string(),
    builtIn: v.boolean(),
    addedAt: v.union(v.number(), v.null()),
    classifications: v.number(),
    websites: v.number(),
    /** True when more classifications use it than were read: the counts are "at least". */
    more: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const type = (await readClassificationTypes(ctx)).find((entry) => entry.key === args.key);
    if (!type) return null;
    const uses = await usesOf(ctx, type.key, USES_READ + 1);
    const read = uses.slice(0, USES_READ);
    return {
      key: type.key,
      nameEn: type.nameEn,
      builtIn: type.builtIn,
      addedAt: type.addedAt,
      classifications: read.length,
      websites: new Set(read.map((row) => row.companyWebsiteId)).size,
      more: uses.length > USES_READ,
    };
  },
});

function nameProblem(problem: "EMPTY" | "TOO_LONG" | "TAKEN"): never {
  if (problem === "EMPTY") throw appError("INVALID_INPUT", "Give the type a name.");
  if (problem === "TOO_LONG") throw appError("INVALID_INPUT", `A type's name is at most ${MOST_TYPE_NAME} characters.`);
  throw appError("INVALID_INPUT", "Another type already has that name.");
}

async function audit(ctx: TenantMutationCtx, actionType: string, entityId: string, metadata: Record<string, unknown>) {
  await ctx.db.insert("auditLogs", {
    actorId: ctx.userId,
    actionType,
    entityType: "classificationTypes",
    entityId,
    metadata: JSON.stringify(metadata),
    timestamp: Date.now(),
  });
}

/**
 * Add a type (no key) or rename one, in English. Answers with the type's key.
 * A shipped type gets a row of its own the first time it is renamed; each new
 * name asks the Translator.
 */
export const saveClassificationType = superAdminMutation({
  args: { key: v.optional(v.string()), name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const types = await readClassificationTypes(ctx);
    const now = Date.now();

    if (args.key === undefined) {
      if (types.length >= MOST_TYPES) throw appError("INVALID_INPUT", `There are already ${MOST_TYPES} types, the most there can be. Remove an added type first.`);
      const checked = checkedTypeName(args.name, types, null);
      if ("problem" in checked) nameProblem(checked.problem);
      const rowId = await ctx.db.insert("classificationTypes", { key: "", nameEn: checked.name, builtIn: false, createdAt: now, updatedAt: now });
      // An added type's key is its own id: what its classifications hold.
      await ctx.db.patch(rowId, { key: rowId });
      await audit(ctx, "CREATE_CLASSIFICATION_TYPE", rowId, { name: checked.name });
      await requestTranslation(ctx, "classificationTypes", rowId);
      return rowId;
    }

    const type = types.find((entry) => entry.key === args.key);
    if (!type) throw appError("NOT_FOUND", "That type is no longer in the list.");
    const checked = checkedTypeName(args.name, types, type.key);
    if ("problem" in checked) nameProblem(checked.problem);
    if (checked.name === type.nameEn) return type.key;

    let rowId = type.rowId as Id<"classificationTypes"> | null;
    if (rowId) await ctx.db.patch(rowId, { nameEn: checked.name, updatedAt: now });
    else rowId = await ctx.db.insert("classificationTypes", { key: type.key, nameEn: checked.name, builtIn: true, createdAt: now, updatedAt: now });
    await audit(ctx, "RENAME_CLASSIFICATION_TYPE", type.key, { before: type.nameEn, after: checked.name });
    await requestTranslation(ctx, "classificationTypes", rowId);
    return type.key;
  },
});

/** Remove an added type no classification uses (CT5). A shipped type, or one in use, is refused. */
export const removeClassificationType = superAdminMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const type = (await readClassificationTypes(ctx)).find((entry) => entry.key === args.key);
    if (!type || !type.rowId) throw appError("NOT_FOUND", "That type is no longer in the list.");
    if (type.builtIn) throw appError("CONFLICT", "A built-in type can be renamed but not removed.");
    if ((await usesOf(ctx, type.key, 1)).length > 0) throw appError("CONFLICT", "Classifications use this type. Move them to another type first.");
    await ctx.db.delete(type.rowId as Id<"classificationTypes">);
    await removeTranslations(ctx, "classificationTypes", type.rowId);
    await audit(ctx, "REMOVE_CLASSIFICATION_TYPE", type.key, { name: type.nameEn });
    return null;
  },
});
