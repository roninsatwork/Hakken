import type { AppLanguage } from "./contentLanguages";

/**
 * The page types every company's classifications pick from (System Settings →
 * Classification, docs/plans/active/classification-types-plan.md). Plain code,
 * no Convex: the shipped seven and the one rule that lays the stored rows over
 * them, so the reads, the writes and the tests agree.
 *
 * A type is one field, its name (Anthony, 2026-10-15: "keep one field, the
 * Type"). Reports read the shipped seven by their keys, as they always have;
 * a type added here is counted on its own.
 */

/** The most types in all, the seven shipped included (CT6). */
export const MOST_TYPES = 50;
/** A type's name sits in a dropdown and a table cell. */
export const MOST_TYPE_NAME = 40;

type ShippedType = { key: string; names: Record<AppLanguage, string> };

/**
 * The seven types Hakken ships with, in the order they are offered, each with
 * its names in every language (`classificationTypes.test.ts` holds that to
 * `APP_LANGUAGES`). Their keys are what saved classifications hold and what
 * reports read, so they never change; a shipped type is renamed by a row of
 * its own.
 */
export const SHIPPED_TYPES: readonly ShippedType[] = [
  { key: "INFORMATIONAL", names: { en: "Informational content", it: "Contenuti informativi" } },
  { key: "SERVICE", names: { en: "Service", it: "Servizio" } },
  { key: "PRODUCT", names: { en: "Product", it: "Prodotto" } },
  { key: "CASE_STUDY", names: { en: "Case study", it: "Caso di studio" } },
  { key: "COMPANY", names: { en: "Company", it: "Azienda" } },
  { key: "LEGAL", names: { en: "Legal", it: "Note legali" } },
  { key: "OTHER", names: { en: "Other", it: "Altro" } },
];

const SHIPPED = new Map(SHIPPED_TYPES.map((type) => [type.key, type]));

export function shippedType(key: string): ShippedType | undefined {
  return SHIPPED.get(key);
}

/** A stored row, as the rule needs it. */
export type TypeRow = { _id: string; key: string; nameEn: string; createdAt: number };

/** One type as the list holds it. */
export type ClassificationTypeEntry = {
  key: string;
  nameEn: string;
  builtIn: boolean;
  /** Its row, when it has one: an added type, or a shipped type once renamed. */
  rowId: string | null;
  /** When it was added; null for a shipped type. */
  addedAt: number | null;
  /** True while a shipped type keeps the English it shipped with, so its shipped names stand in every language. */
  shippedName: boolean;
};

/** The list: the shipped seven in their order, each as its row has it, then the added types, oldest first. */
export function typesFrom(rows: readonly TypeRow[]): ClassificationTypeEntry[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const shipped = SHIPPED_TYPES.map((type): ClassificationTypeEntry => {
    const row = byKey.get(type.key);
    const nameEn = row?.nameEn ?? type.names.en;
    return { key: type.key, nameEn, builtIn: true, rowId: row?._id ?? null, addedAt: null, shippedName: nameEn === type.names.en };
  });
  const added = rows
    .filter((row) => !SHIPPED.has(row.key))
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((row): ClassificationTypeEntry => ({ key: row.key, nameEn: row.nameEn, builtIn: false, rowId: row._id, addedAt: row.createdAt, shippedName: false }));
  return [...shipped, ...added];
}

/** A tidy name, or why it can't be kept: empty, too long, or another type's (whatever its case). */
export function checkedTypeName(name: string, types: readonly ClassificationTypeEntry[], own: string | null): { name: string } | { problem: "EMPTY" | "TOO_LONG" | "TAKEN" } {
  const tidy = name.trim().replace(/\s+/g, " ");
  if (!tidy) return { problem: "EMPTY" };
  if (tidy.length > MOST_TYPE_NAME) return { problem: "TOO_LONG" };
  const lower = tidy.toLowerCase();
  if (types.some((type) => type.key !== own && type.nameEn.toLowerCase() === lower)) return { problem: "TAKEN" };
  return { name: tidy };
}
