import { CHART_MARK } from "./assistantCharts";

/**
 * Words for Telegram (docs/plans/active/hakken-tasks-plan.md, item 6.1):
 * Telegram shows a message in its own chat and reads only a few HTML tags, so
 * an answer's Markdown is turned into them — bold, links, code — every other
 * character escaped, a link into the app made whole, and the chart's mark
 * dropped (a chart is a link instead). Plain code.
 */

/** Telegram's longest message. */
export const TELEGRAM_MOST_CHARACTERS = 4096;

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A link as Telegram can open it: one into the app made whole; anything but http(s) is dropped. */
function whole(url: string, appUrl: string): string | null {
  if (url.startsWith("/")) return `${appUrl.replace(/\/+$/, "")}${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** An answer's Markdown in Telegram's HTML: headings and bold as bold, lists as bullets, links and code kept. */
export function telegramHtml(markdown: string, appUrl: string): string {
  const lines = markdown.replaceAll(CHART_MARK, "").split("\n").map((line) => {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) return `**${heading[1]}**`;
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) return "";
    return line.replace(/^(\s*)[-*]\s+/, "$1• ");
  });
  let html = escape(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim());
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // An address may hold one pair of brackets of its own.
  html = html.replace(/\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_all, label: string, url: string) => {
    const link = whole(url.replace(/&amp;/g, "&"), appUrl);
    return link ? `<a href="${link.replace(/"/g, "&quot;")}">${label}</a>` : label;
  });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1<i>$2</i>");
  return html.length > TELEGRAM_MOST_CHARACTERS ? `${html.slice(0, TELEGRAM_MOST_CHARACTERS - 1).replace(/<[^>]*$/, "")}…` : html;
}

/** A linking code as people type it, without its space: "482 913" → "482913"; null when it is not one. */
export function linkCodeOf(text: string): string | null {
  const digits = text.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** A headline read on from "Heads up:": "Your page had a quiet day." → "your page had a quiet day", a name such as "AI" left as it is. */
export function readOn(headline: string): string {
  const trimmed = headline.trim().replace(/[.!]+$/, "");
  return /^[A-Z][a-z]/.test(trimmed) ? `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}` : trimmed;
}
