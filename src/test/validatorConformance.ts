/**
 * Check a plain value against a Convex validator, in the exported JSON form
 * that `exportReturns()` hands back.
 *
 * This exists so a hand-written stand-in can be held against the real
 * declaration rather than against someone's memory of it. It is deliberately
 * strict in both directions: a field the declaration does not have is as much a
 * mismatch as a field it requires and the value lacks. The extra-field
 * direction is the one that bites hardest, because a screen can be built
 * against a field the stand-in invented, pass every browser test, and then find
 * nothing there in front of a real person — Convex refuses an undeclared field
 * at run time rather than passing it through.
 */

export type ExportedValidator = {
  type: string;
  value?: unknown;
  tableName?: string;
  keys?: ExportedValidator;
  values?: { fieldType: ExportedValidator; optional: boolean };
};

type ObjectFields = Record<string, { fieldType: ExportedValidator; optional: boolean }>;

/** How deep to describe a mismatch before the message stops being readable. */
const MAX_PROBLEMS = 12;

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value instanceof ArrayBuffer) return "bytes";
  if (typeof value === "object") return `an object {${Object.keys(value as object).slice(0, 6).join(", ")}}`;
  if (typeof value === "string") return `the text "${value.slice(0, 24)}"`;
  return `${typeof value} ${String(value)}`;
}

/**
 * Whether a validator is even the right sort of thing for this value. Used to
 * choose which branch of a union to report against, not to accept or reject.
 */
function kindMatches(value: unknown, type: string): boolean {
  if (type === "any" || type === "literal") return true;
  if (value === null) return type === "null";
  if (Array.isArray(value)) return type === "array";
  if (value instanceof ArrayBuffer) return type === "bytes";
  switch (typeof value) {
    case "object": return type === "object" || type === "record";
    case "string": return type === "string" || type === "id";
    case "number": return type === "number" || type === "float64";
    case "bigint": return type === "bigint" || type === "int64";
    case "boolean": return type === "boolean";
    default: return false;
  }
}

/**
 * Returns one line per mismatch, deepest path first. An empty array means the
 * value is something the declaration would accept.
 */
export function conformanceProblems(
  value: unknown,
  validator: ExportedValidator,
  at = ""
): string[] {
  const where = at || "(root)";

  switch (validator.type) {
    case "any":
      return [];

    case "null":
      return value === null ? [] : [`${where}: expected nothing, got ${describe(value)}`];

    case "number":
    case "float64":
      return typeof value === "number" ? [] : [`${where}: expected a number, got ${describe(value)}`];

    case "bigint":
    case "int64":
      return typeof value === "bigint" ? [] : [`${where}: expected a whole number, got ${describe(value)}`];

    case "boolean":
      return typeof value === "boolean" ? [] : [`${where}: expected true or false, got ${describe(value)}`];

    case "string":
      return typeof value === "string" ? [] : [`${where}: expected text, got ${describe(value)}`];

    // An id is a string once it has left the database, so that is all that can
    // be checked here without a live deployment to resolve it against.
    case "id":
      return typeof value === "string"
        ? []
        : [`${where}: expected an id for ${validator.tableName}, got ${describe(value)}`];

    case "bytes":
      return value instanceof ArrayBuffer ? [] : [`${where}: expected bytes, got ${describe(value)}`];

    case "literal":
      return value === validator.value
        ? []
        : [`${where}: expected exactly ${JSON.stringify(validator.value)}, got ${describe(value)}`];

    case "array": {
      if (!Array.isArray(value)) return [`${where}: expected a list, got ${describe(value)}`];
      const element = validator.value as ExportedValidator;
      // Every element is checked. A stand-in usually holds one or two rows, and
      // the second row is exactly where a hand-written copy tends to drift.
      return value.flatMap((entry, index) =>
        conformanceProblems(entry, element, `${where}[${index}]`)
      );
    }

    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return [`${where}: expected an object, got ${describe(value)}`];
      }
      const fields = (validator.value ?? {}) as ObjectFields;
      const actual = value as Record<string, unknown>;
      const problems: string[] = [];

      for (const [name, field] of Object.entries(fields)) {
        const present = name in actual && actual[name] !== undefined;
        if (!present) {
          if (!field.optional) problems.push(`${where}.${name}: missing — the real answer always has it`);
          continue;
        }
        problems.push(...conformanceProblems(actual[name], field.fieldType, `${where}.${name}`));
      }

      for (const name of Object.keys(actual)) {
        // undefined is how a stand-in spells "not set", and Convex drops it too.
        if (actual[name] === undefined) continue;
        if (!(name in fields)) {
          problems.push(`${where}.${name}: invented — the real answer never sends it`);
        }
      }

      return problems;
    }

    case "record": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return [`${where}: expected a lookup table, got ${describe(value)}`];
      }
      const values = validator.values;
      if (!values) return [];
      return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
        conformanceProblems(entry, values.fieldType, `${where}.${key}`)
      );
    }

    case "union": {
      const members = (validator.value ?? []) as ExportedValidator[];
      if (members.length === 0) return [];
      if (members.some((member) => conformanceProblems(value, member, where).length === 0)) return [];

      // Report against the branches of the same kind as the value. Without
      // this, `union(somethingDetailed, null)` given a nearly-right object
      // reports "expected nothing" — the null branch fails in one line and so
      // looks closest, while the branch the caller actually meant is buried.
      const sameKind = members.filter((member) => kindMatches(value, member.type));
      const candidates = sameKind.length > 0 ? sameKind : [];
      if (candidates.length === 0) {
        return [
          `${where}: matches none of the ${members.length} allowed forms, got ${describe(value)}`,
        ];
      }
      // Among branches of the right kind, the nearest miss is the informative
      // one: a union of eight literals otherwise buries it under seven others.
      return candidates
        .map((member) => conformanceProblems(value, member, where))
        .reduce((best, current) => (current.length < best.length ? current : best));
    }

    default:
      // An unknown validator kind must not quietly pass. If Convex grows one,
      // this fails loudly and the checker gets taught about it.
      return [`${where}: this check does not understand a '${validator.type}' declaration`];
  }
}

export function summariseProblems(problems: string[]): string {
  if (problems.length <= MAX_PROBLEMS) return problems.join("\n");
  return [
    ...problems.slice(0, MAX_PROBLEMS),
    `…and ${problems.length - MAX_PROBLEMS} more`,
  ].join("\n");
}
