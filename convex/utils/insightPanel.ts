import { v, type Infer } from "convex/values";

/**
 * The buyer-question panel (docs/plans/active/insights-analyst-plan.md I28,
 * phase 12, drawn as the VisAiAnswers board): the questions a business's
 * buyers would ask an AI assistant, built from what they search for, the
 * services the business sells and the guides that bring it visitors, phrased
 * with and without its name — asked of every assistant each week, once the
 * company's "Buyer questions" collection is switched on. The answers land in
 * the AI answer tables Visibility already keeps.
 */

export const panelQuestionValidator = v.object({
  prompt: v.string(),
  /** What it was built from: a search buyers make, "your name", or a guide's subject. */
  builtFrom: v.string(),
  kind: v.union(v.literal("SEARCH"), v.literal("NAME"), v.literal("GUIDE")),
  /** Searches a month for what it was built from, where Google's results say. */
  volume: v.union(v.number(), v.null()),
  withName: v.boolean(),
});
export type PanelQuestion = Infer<typeof panelQuestionValidator>;

/** Questions in a panel. */
export const PANEL_SIZE = 40;
/** A panel is built again after this many days, as searches and services change. */
export const PANEL_REFRESH_DAYS = 90;

/** The questions a model's answer holds, each checked: a real question, a known source, each once. */
export function panelFrom(raw: unknown, name: string, sources: ReadonlyMap<string, number | null>): PanelQuestion[] {
  const list = Array.isArray((raw as { questions?: unknown })?.questions) ? (raw as { questions: unknown[] }).questions : [];
  const seen = new Set<string>();
  const nameWords = name.toLowerCase();
  return list.flatMap((entry): PanelQuestion[] => {
    const question = entry as Record<string, unknown>;
    const prompt = typeof question.prompt === "string" ? question.prompt.trim().replace(/\s+/g, " ") : "";
    if (prompt.length < 12 || prompt.length > 300 || seen.has(prompt.toLowerCase())) return [];
    seen.add(prompt.toLowerCase());
    const builtFrom = typeof question.builtFrom === "string" ? question.builtFrom.trim().toLowerCase() : "";
    const withName = Boolean(nameWords) && prompt.toLowerCase().includes(nameWords);
    const kind: PanelQuestion["kind"] = question.kind === "GUIDE" ? "GUIDE" : withName || question.kind === "NAME" ? "NAME" : "SEARCH";
    return [{ prompt, builtFrom: kind === "NAME" ? "your name" : builtFrom || "–", kind, volume: sources.get(builtFrom) ?? null, withName }];
  }).slice(0, PANEL_SIZE);
}

/** How the panel's questions are written. */
export const PANEL_RULES = [
  `You build a panel of ${PANEL_SIZE} questions a business's buyers would ask an AI assistant such as ChatGPT when choosing a supplier, so the business can see whether the assistant names it.`,
  "Write each as a real person would type it: plain, specific, with the place where the business works when buyers would say it. Most name no business; about one in eight names the business itself (\"Is [name] a good …?\", \"What does [name] charge for …?\").",
  "Build them from the searches given, most searched first, so each service the business sells is covered; add two or three from the guides that bring it visitors. Never invent a service it doesn't offer.",
  "Answer only with JSON: {\"questions\": [{\"prompt\": the question, \"builtFrom\": the search or guide subject it came from, exactly as given, or \"your name\", \"kind\": \"SEARCH\", \"NAME\" or \"GUIDE\"}]}.",
].join("\n");
