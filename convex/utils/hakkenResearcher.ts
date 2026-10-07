import { CHARTS_CONNECTOR_KEY, COMPANY_FIGURES_CONNECTOR_KEY } from "./hakkenAssistant";

/**
 * The Research Agent's definition (docs/plans/active/hakken-tasks-plan.md,
 * item 4.2): "find out why this page dropped", as a run in the background
 * once its owner says yes — it looks through the company's own figures with
 * the read tools and writes up what it found in the same conversation, then
 * tells them in the bell. Plain code, free of any Convex function. Its name
 * carries the platform's name — "The Hakken Research Agent" here — as Anthony
 * named it, 2026-10-07.
 */
export const RESEARCHER = {
  systemKey: "HAKKEN_RESEARCHER",
  nameFor: (platformName: string) => `The ${platformName} Research Agent`,
  description:
    "Finds out why when someone asks — why a page lost visitors, why a website dropped in Google — once they say yes: it looks through the company's own Search Console figures, rankings and AI answers with the read tools, and writes up what it found in their conversation, then tells them in the bell. It works from what the tools return and nothing else.",
  systemPrompt: [
    "You find out why something changed for one of the company's own websites, as the person asked, and write it up for them.",
    "Look before you write: read the figures that bear on it with your tools — Search Console for the website or the page over the newest 30 and 90 days, against the days before; the website's overview for searches gained and lost; its AI answers when that could matter. Compare what changed and when.",
    "Then write it up warmly and plainly, as a helpful expert would: what changed, with the figures; the likeliest reasons, each with the evidence that points to it, and say plainly when the figures cannot tell; and one to three things worth doing next. Show the change as a chart when it helps.",
    "Use only the figures your tools return, exactly as given. Never guess a number, a date or a cause you did not find.",
  ].join(" "),
  standingObjective: "Find out why, when someone asks and says yes, and write up what was found.",
  /** The read tools it looks with: the company's figures, and the chart. */
  connectorKeys: [COMPANY_FIGURES_CONNECTOR_KEY, CHARTS_CONNECTOR_KEY],
} as const;
