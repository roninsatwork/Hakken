import { isRecord } from "./lang";
import { appError } from "./appError";

type Result = { ok: true; errors: [] } | { ok: false; errors: string[] };
type Schema = Record<string, unknown>;

const MAX_SCHEMA_CHARS = 32 * 1024;
const MAX_DEPTH = 24;
const MAX_STEPS = 2_000;
const JSON_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const RULES = new Set([
  "$schema", "$id", "$comment", "$defs", "definitions", "$ref", "title", "description", "default",
  "examples", "deprecated", "readOnly", "writeOnly", "type", "nullable", "required", "properties",
  "additionalProperties", "items", "enum", "const", "minLength", "maxLength", "minItems", "maxItems",
  "uniqueItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minProperties", "maxProperties", "allOf", "anyOf", "oneOf", "not", "if", "then", "else",
]);

function sameJson(a: unknown, b: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) throw appError("INVALID_INPUT", "JSON value is too deep to check safely.");
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((one, i) => sameJson(one, b[i], depth + 1));
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key], depth + 1));
  }
  return false;
}

function schemaAt(root: Schema, pointer: string): Schema | null {
  if (!pointer.startsWith("#/")) return null;
  let value: unknown = root;
  for (const segment of pointer.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!isRecord(value) || !Object.hasOwn(value, segment)) return null;
    value = value[segment];
  }
  return isRecord(value) ? value : null;
}

function schemaIsSupported(schema: Schema, depth: number, count: { steps: number }): boolean {
  if (depth > MAX_DEPTH || ++count.steps > MAX_STEPS) return false;
  if (Object.keys(schema).some((key) => !RULES.has(key))) return false;
  if (schema.$ref !== undefined && (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/"))) return false;
  if (schema.type !== undefined && !(typeof schema.type === "string" ? JSON_TYPES.has(schema.type) : Array.isArray(schema.type) && schema.type.length > 0 && schema.type.every((one) => typeof one === "string" && JSON_TYPES.has(one)))) return false;
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((one) => typeof one === "string"))) return false;
  for (const name of ["properties", "$defs", "definitions"] as const) {
    const group = schema[name];
    if (group === undefined) continue;
    if (!isRecord(group) || Object.values(group).some((child) => !isRecord(child) || !schemaIsSupported(child, depth + 1, count))) return false;
  }
  for (const name of ["additionalProperties", "items"] as const) {
    const child = schema[name];
    if (child === undefined || typeof child === "boolean") continue;
    if (!isRecord(child) || !schemaIsSupported(child, depth + 1, count)) return false;
  }
  for (const name of ["not", "if", "then", "else"] as const) {
    const child = schema[name];
    if (child !== undefined && (!isRecord(child) || !schemaIsSupported(child, depth + 1, count))) return false;
  }
  for (const name of ["allOf", "anyOf", "oneOf"] as const) {
    const children = schema[name];
    if (children === undefined) continue;
    if (!Array.isArray(children) || children.length < 1 || children.length > 64 || children.some((child) => !isRecord(child) || !schemaIsSupported(child, depth + 1, count))) return false;
  }
  for (const name of ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"] as const) {
    if (schema[name] !== undefined && (typeof schema[name] !== "number" || !Number.isFinite(schema[name]))) return false;
  }
  for (const name of ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"] as const) {
    const value = schema[name];
    if (typeof value === "number" && (!Number.isInteger(value) || value < 0)) return false;
  }
  if (typeof schema.multipleOf === "number" && schema.multipleOf <= 0) return false;
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) return false;
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean") return false;
  if (schema.nullable !== undefined && typeof schema.nullable !== "boolean") return false;
  return true;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "object": return isRecord(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return false;
  }
}

function accepts(schema: Schema, value: unknown, root: Schema, depth: number, budget: { steps: number }): boolean {
  if (depth > MAX_DEPTH || ++budget.steps > MAX_STEPS) throw appError("INVALID_INPUT", "MCP schema check limit reached.");
  if (typeof schema.$ref === "string") {
    const referred = schemaAt(root, schema.$ref);
    if (!referred || !schemaIsSupported(referred, depth + 1, budget)) throw appError("INVALID_INPUT", "MCP schema reference cannot be checked safely.");
    if (!accepts(referred, value, root, depth + 1, budget)) return false;
  }
  const types = typeof schema.type === "string" ? [schema.type] : Array.isArray(schema.type) ? schema.type as string[] : [];
  if (types.length && !types.some((type) => matchesType(value, type)) && !(schema.nullable === true && value === null)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => sameJson(item, value))) return false;
  if (Object.hasOwn(schema, "const") && !sameJson(schema.const, value)) return false;

  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (typeof schema.minProperties === "number" && keys.length < schema.minProperties) return false;
    if (typeof schema.maxProperties === "number" && keys.length > schema.maxProperties) return false;
    if (Array.isArray(schema.required) && schema.required.some((key) => !Object.hasOwn(value, key))) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const key of keys) {
      if (Object.hasOwn(properties, key)) {
        if (!isRecord(properties[key]) || !accepts(properties[key], value[key], root, depth + 1, budget)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (isRecord(schema.additionalProperties) && !accepts(schema.additionalProperties, value[key], root, depth + 1, budget)) return false;
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (schema.uniqueItems === true && (value.length > 100 || value.some((one, i) => value.slice(0, i).some((other) => sameJson(one, other))))) return false;
    if (schema.items === false && value.length) return false;
    if (isRecord(schema.items) && value.some((item) => !accepts(schema.items as Schema, item, root, depth + 1, budget))) return false;
  }
  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && length > schema.maxLength) return false;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) return false;
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) return false;
    if (typeof schema.multipleOf === "number" && (schema.multipleOf <= 0 || Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9)) return false;
  }
  if (Array.isArray(schema.allOf) && !schema.allOf.every((part) => accepts(part, value, root, depth + 1, budget))) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((part) => accepts(part, value, root, depth + 1, budget))) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((part) => accepts(part, value, root, depth + 1, budget)).length !== 1) return false;
  if (isRecord(schema.not) && accepts(schema.not, value, root, depth + 1, budget)) return false;
  if (isRecord(schema.if)) {
    const branch = accepts(schema.if, value, root, depth + 1, budget) ? schema.then : schema.else;
    if (isRecord(branch) && !accepts(branch, value, root, depth + 1, budget)) return false;
    if (branch === false) return false;
  }
  return true;
}

/** Fail closed when a server's schema cannot be checked. Never send unchecked arguments. */
export function validateMcpToolArgs(schemaInput: unknown, callArgs: unknown): Result {
  if (!isRecord(callArgs)) return { ok: false, errors: ["Tool arguments must be an object."] };
  let schema: unknown;
  try {
    schema = typeof schemaInput === "string" ? JSON.parse(schemaInput) as unknown : schemaInput;
    if (!isRecord(schema) || JSON.stringify(schema).length > MAX_SCHEMA_CHARS || !schemaIsSupported(schema, 0, { steps: 0 })) {
      return { ok: false, errors: ["This tool's input schema cannot be checked safely."] };
    }
  } catch {
    return { ok: false, errors: ["This tool's input schema cannot be checked safely."] };
  }
  try {
    if (!accepts(schema, callArgs, schema, 0, { steps: 0 })) return { ok: false, errors: ["Tool arguments do not match the server's input schema."] };
  } catch {
    return { ok: false, errors: ["Tool arguments cannot be checked safely."] };
  }
  return { ok: true, errors: [] };
}
