import type { SeoOperation } from "./dataForSeoRegistry";
import { DEFAULT_LOCATION_CODE, countryCodeOf } from "./utils/seoLocations";

/**
 * Brand radar (docs/plans/active/discovery-local-reputation-ai-plan.md, step
 * 4, D10): the questions where Google's AI answers in the website's country
 * name or cite a website, with how often each is asked and the pages each
 * answer quotes — DataForSEO's LLM Mentions search, $0.11 for ten tried
 * 2026-10-09 (24 million UK answers held). Bought monthly for the website and
 * the rivals watched beside it, while the company has Brand radar on (D16).
 *
 * The website is sent as text, not as a host: an operation whose one required
 * parameter is a host is planned for every website (`seoSiteOperations`).
 */
export const RADAR_OPERATION = "radar_mentions";
/** Bought once a month: a website's mentions move slowly. */
export const RADAR_DAYS = 30;

export const RADAR_OPERATIONS: readonly SeoOperation[] = [{
  id: RADAR_OPERATION,
  question: "Which questions do Google's AI answers name or cite this website for, and how often is each asked?",
  family: "AI Optimization",
  mode: "LIVE",
  path: "/v3/ai_optimization/llm_mentions/search/live",
  costBand: "medium",
  params: {
    target: { kind: "text", required: true, description: "The website, as [{\"domain\": \"example.co.uk\"}]." },
    limit: { kind: "number", required: false, description: "How many questions to read.", default: 200 },
  },
}];

export function isRadarOperation(operationId: string): boolean {
  return operationId === RADAR_OPERATION;
}

/** What one website's monthly reading is sent: its host, Google's AI answers in its country, in English. */
export function radarParams(host: string, locationCode: number | undefined, limit: number): Record<string, unknown> {
  return {
    target: [{ domain: host }],
    platform: "google",
    location_code: countryCodeOf(locationCode ?? DEFAULT_LOCATION_CODE),
    language_code: "en",
    limit,
  };
}

/** The website a reading was for, read back from what was sent. */
export function radarHostAskedFor(params: Record<string, unknown>): string | null {
  const target = Array.isArray(params.target) ? params.target[0] : null;
  const domain = target && typeof target === "object" ? (target as Record<string, unknown>).domain : null;
  return typeof domain === "string" && domain ? domain.toLowerCase() : null;
}
