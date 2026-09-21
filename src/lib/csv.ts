/**
 * Serialize one CSV cell without handing spreadsheet software a formula.
 *
 * CSV quoting protects row structure, not evaluation: Excel and similar tools
 * still execute quoted cells beginning with =, +, -, or @. Audit exports carry
 * user-controlled names and record titles, so neutralize those prefixes before
 * applying ordinary CSV escaping.
 */
export function safeCsvCell(value: unknown): string {
  const text = String(value);
  const literal = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${literal.replaceAll('"', '""')}"`;
}
