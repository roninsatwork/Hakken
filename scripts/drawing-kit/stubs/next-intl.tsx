// The drawing kit's words: the English dictionary, with the plain ICU forms
// the screens use ({name}, plural with =0/one/other and #).
import type { ReactNode } from "react";
import messages from "../../../messages/en.json";

type Values = Record<string, unknown>;

function lookup(path: string): string | undefined {
  let node: unknown = messages;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

function format(template: string, values: Values = {}): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch !== "{") { out += ch; i++; continue; }
    let depth = 1, j = i + 1;
    while (j < template.length && depth > 0) { if (template[j] === "{") depth++; else if (template[j] === "}") depth--; j++; }
    const body = template.slice(i + 1, j - 1);
    const [name, kind, ...rest] = body.split(",");
    const value = values[name.trim()];
    if (kind && kind.trim() === "plural") {
      const forms = rest.join(",");
      const n = Number(value);
      const pick = (key: string) => { const m = forms.match(new RegExp(`${key.replace("=", "=")}\\s*\\{`)); if (!m || m.index === undefined) return undefined; let d = 1, k = m.index + m[0].length; const start = k; while (k < forms.length && d > 0) { if (forms[k] === "{") d++; else if (forms[k] === "}") d--; k++; } return forms.slice(start, k - 1); };
      const chosen = pick(`=${n}`) ?? (n === 1 ? pick("one") : undefined) ?? pick("other") ?? "";
      out += format(chosen.replace(/#/g, Number.isFinite(n) ? n.toLocaleString("en-GB") : ""), values);
    } else if (kind && kind.trim() === "select") {
      out += String(value ?? "");
    } else {
      out += value === undefined ? `{${name.trim()}}` : String(value);
    }
    i = j;
  }
  return out;
}

export function useTranslations(namespace?: string) {
  const t = (key: string, values?: Values) => {
    const found = lookup(namespace ? `${namespace}.${key}` : key);
    return found === undefined ? key : format(found, values);
  };
  t.rich = (key: string, values?: Values) => t(key, values) as ReactNode;
  t.markup = t;
  t.raw = (key: string) => lookup(namespace ? `${namespace}.${key}` : key);
  t.has = (key: string) => lookup(namespace ? `${namespace}.${key}` : key) !== undefined;
  return t;
}
export const useLocale = () => "en";
export const useFormatter = () => ({
  number: (n: number, options?: Intl.NumberFormatOptions) => n.toLocaleString("en-GB", options),
  dateTime: (d: Date | number, options?: Intl.DateTimeFormatOptions) => new Date(d).toLocaleDateString("en-GB", options),
  relativeTime: () => "today",
});
export const useNow = () => new Date("2026-10-04T09:00:00Z");
export const useTimeZone = () => "Europe/London";
export const NextIntlClientProvider = ({ children }: { children: ReactNode }) => children;
