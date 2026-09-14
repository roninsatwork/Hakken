const RESERVED = new Set([
  "expectedRevision",
  "companyId",
  "createdAt",
  "updatedAt",
  "revision",
  "createdBy",
  "id",
  "constructor",
  "prototype",
  "__proto__",
]);
const ITALIAN = {
  suppliers: "Fornitori",
  purchaseOrders: "Ordini di acquisto",
  invoices: "Fatture",
  companyPolicies: "Politiche aziendali",
  projects: "Progetti",
  contacts: "Contatti",
  name: "Nome",
  title: "Titolo",
  amount: "Importo",
  due: "Scadenza",
  active: "Attivo",
  supplierId: "Fornitore",
  description: "Descrizione",
  notes: "Note",
  email: "Email",
};
const IDENTIFIER = /^[a-z][a-zA-Z0-9]*$/;
export const pascal = (value) => value[0].toUpperCase() + value.slice(1);
export const label = (value) =>
  pascal(value).replace(/([a-z])([A-Z])/g, "$1 $2");
const pluralise = (value) =>
  /[^aeiou]y$/.test(value)
    ? value.slice(0, -1) + "ies"
    : /(s|sh|ch|x|z)$/.test(value)
      ? value + "es"
      : value + "s";

export function parseArgs(argv) {
  const [name, ...rest] = argv;
  if (!name || !/^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/.test(name)) {
    throw new Error(
      "Use a singular lower-case name, e.g. supplier or purchase-order.",
    );
  }
  const singular = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (RESERVED.has(singular)) throw new Error("Reserved entity name.");
  const entity = {
    name,
    singular,
    table: pluralise(singular),
    route: pluralise(name),
    fields:
      /** @type {Array<{name: string, type: string, target?: string, labelIt?: string}>} */ ([]),
    labelField: "",
    labelIt: "",
  };
  const fieldLabels = new Map();
  let italianLabel;
  let apply = false;
  let preview = false;
  let root = process.cwd();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === "--label-it") {
      italianLabel = rest[++i];
      if (!italianLabel) throw new Error("--label-it needs a label.");
      continue;
    }
    if (flag === "--field-label-it") {
      const spec = rest[++i] ?? "";
      const split = spec.indexOf("=");
      if (split < 1)
        throw new Error("--field-label-it needs name=Italian label.");
      const field = spec.slice(0, split);
      if (fieldLabels.has(field))
        throw new Error("Duplicate Italian field label.");
      fieldLabels.set(field, spec.slice(split + 1));
      continue;
    }
    if (flag === "--apply") {
      apply = true;
      continue;
    }
    if (flag === "--dry-run") {
      preview = true;
      continue;
    }
    if (flag === "--root") {
      root = rest[++i];
      if (!root) throw new Error("--root needs a directory.");
      continue;
    }
    if (flag !== "--field") throw new Error(`Unknown argument: ${flag}`);
    const spec = rest[++i] ?? "";
    const [fieldName, type, target, ...extra] = spec.split(":");
    if (
      !IDENTIFIER.test(fieldName) ||
      RESERVED.has(fieldName) ||
      entity.fields.some((f) => f.name === fieldName)
    ) {
      throw new Error(`Invalid, duplicate or reserved field: ${fieldName}`);
    }
    if (
      !["string", "number", "boolean", "date", "ref"].includes(type) ||
      extra.length ||
      (type === "ref" ? !IDENTIFIER.test(target ?? "") : target !== undefined)
    ) {
      throw new Error(
        `Unknown field type or malformed field: ${spec}. Use string, number, boolean, date or ref:generatedTable.`,
      );
    }
    entity.fields.push({
      name: fieldName,
      type,
      ...(target ? { target } : {}),
    });
  }
  if (apply && preview)
    throw new Error("Choose --apply or --dry-run, not both.");
  if (!entity.fields.length)
    entity.fields.push({ name: "name", type: "string" });
  if (entity.fields.length > 20)
    throw new Error("At most 20 fields per feature.");
  entity.labelField = entity.fields.find((f) => f.type === "string")?.name;
  if (!entity.labelField)
    throw new Error(
      "Include a string field for the record label and indexed search.",
    );
  const checkedLabel = (value, hint) => {
    if (typeof value !== "string" || !value.trim() || value.length > 120)
      throw new Error(
        `Provide an Italian label with ${hint} (1–120 characters).`,
      );
    return value.trim();
  };
  entity.labelIt = checkedLabel(
    italianLabel ?? ITALIAN[entity.table],
    "--label-it",
  );
  for (const field of entity.fields)
    field.labelIt = checkedLabel(
      fieldLabels.get(field.name) ?? ITALIAN[field.name],
      `--field-label-it ${field.name}=...`,
    );
  for (const name of fieldLabels.keys())
    if (!entity.fields.some((f) => f.name === name))
      throw new Error(`Italian label names an unknown field: ${name}`);
  return { entity, root, apply };
}
export const validator = (field) =>
  field.type === "ref"
    ? `v.id("${field.target}")`
    : `v.${field.type === "date" ? "string" : field.type}()`;
export const fieldsCode = (entity) =>
  entity.fields.map((f) => `  ${f.name}: ${validator(f)},`).join("\n");
export const sample = (field) =>
  field.type === "boolean"
    ? "true"
    : field.type === "number"
      ? "12.5"
      : field.type === "date"
        ? '"2026-09-13"'
        : field.type === "ref"
          ? `refs.${field.name}`
          : '"Sample"';
