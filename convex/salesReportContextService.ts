import { buildUntrustedKnowledgeContext } from "./aiPromptAssembly";

/**
 * Grounding for the board report: what the agent remembers, and what the
 * company has shared with it.
 *
 * The report generator reads the pipeline document in full, but a pipeline
 * export cannot say why a deal matters or what the team agreed last quarter.
 * That context lives in the agent's knowledge base and its memories — the same
 * sources the interactive runtime injects — so report generation gathers them
 * too, through the helpers here.
 *
 * Everything in this file is pure so the assembly can be tested without a
 * model, an embedding provider, or a database.
 */

/**
 * What the report is about, as a retrieval query. The fixed phrasing names the
 * subjects a board report actually covers, so memory search and vector search
 * have something to match against; a run-specific focus sharpens it further.
 */
const REPORT_QUERY_BASE =
  "sales pipeline board report: deals, risks, forecasts, pricing, accounts, team performance";

/** Memory context stays small — it seasons the report, it is not the report. */
export const REPORT_MEMORY_MAX_CHARS = 6000;

/** Retrieved knowledge gets more room, but far less than the pipeline itself. */
export const REPORT_KNOWLEDGE_MAX_CHARS = 16000;

export function buildReportQueryText(focus?: string) {
  const trimmedFocus = focus?.trim();
  return trimmedFocus ? `${REPORT_QUERY_BASE}. This run, pay particular attention to: ${trimmedFocus}` : REPORT_QUERY_BASE;
}

export function buildSalesReportGroundingContext(args: {
  agentMemories: string[];
  companyMemories: { title: string; content: string }[];
  knowledgeChunks: string[];
  goalPages?: { title: string; content: string }[];
}) {
  let grounding = "";

  // The company's stated aims lead (personal-layer-and-goals-plan.md,
  // part 1): a board report measures the numbers against what the
  // workspace said it wants, not just against last month.
  if (args.goalPages && args.goalPages.length > 0) {
    grounding += buildUntrustedKnowledgeContext({
      sourceLabel: "company goal (what the workspace is aiming at)",
      chunks: args.goalPages.map((goal) => `${goal.title}: ${goal.content}`),
      maxChars: REPORT_MEMORY_MAX_CHARS,
    });
  }

  if (args.agentMemories.length > 0) {
    grounding += buildUntrustedKnowledgeContext({
      sourceLabel: "agent memory",
      chunks: args.agentMemories,
      maxChars: REPORT_MEMORY_MAX_CHARS,
    });
  }

  if (args.companyMemories.length > 0) {
    grounding += buildUntrustedKnowledgeContext({
      sourceLabel: "company memory",
      chunks: args.companyMemories.map((memory) => `${memory.title}: ${memory.content}`),
      maxChars: REPORT_MEMORY_MAX_CHARS,
    });
  }

  if (args.knowledgeChunks.length > 0) {
    grounding += buildUntrustedKnowledgeContext({
      sourceLabel: "company knowledge shared with this agent",
      chunks: args.knowledgeChunks,
      maxChars: REPORT_KNOWLEDGE_MAX_CHARS,
    });
  }

  return grounding;
}
