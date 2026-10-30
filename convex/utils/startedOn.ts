import { v, type Infer } from "convex/values";

/**
 * The page an Ask Hakken conversation started on, from the eye's panel (sees-side-panel-plan-2026-10-31.md, phase
 * 3): what Ask Hakken is told so "why?" means this page's figures. Words only, never a figure to be repeated
 * unchecked: Ask Hakken still reads the screens for every number it gives.
 */
export const startedOnValidator = v.object({
  /** The screen's address in the app. */
  path: v.string(),
  /** What the page is, in words: "Conversions: what this shop counts as a conversion, last month". */
  about: v.string(),
  /** The dates, country and device the page was on, as words. */
  dates: v.string(),
  /** What code found in the page's figures, each as a sentence. */
  findings: v.array(v.string()),
  /** What the eye said about the page. */
  said: v.array(v.string()),
});

export type StartedOn = Infer<typeof startedOnValidator>;

/** Most findings and sentences kept: the panel's own. */
const MOST = 12;

/** The page as Ask Hakken is told it, below the website it is about. */
export function startedOnLines(page: StartedOn): string {
  const lines = [
    `The person started this conversation on a page of the app: ${page.about} (${page.path}), ${page.dates}.`,
    "When they say \"this\", \"here\" or \"why\", they mean this page and its figures. Read the page's screen with your tools for any figure you give; never repeat a number from below unchecked.",
  ];
  if (page.findings.length > 0) lines.push("", "What the figures show, as the platform's code found them:", ...page.findings.slice(0, MOST).map((line) => `- ${line}`));
  if (page.said.length > 0) lines.push("", "What the eye's panel said about the page:", ...page.said.slice(0, MOST).map((line) => `- ${line}`));
  return lines.join("\n");
}
