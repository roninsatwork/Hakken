import type { ToolConnectorDefinition } from "./toolConnectorDefinitions";

export const ASSISTANT_PAGE_CHARTS_CONNECTOR: ToolConnectorDefinition = {
  // A chart from the page the conversation started on, redrawn (ask-hakken-every-chart-page-plan-2026-11-03.md,
  // shared work 9). Its own connector, as a new one reaches an Assistant already installed and a new tool in an
  // installed one would not.
  key: "assistant-page-charts",
  name: "Assistant page charts",
  description:
    "Lets the Assistant redraw any chart on the page a conversation started on — bars, a pie, a line, the top ten, against the period before — from that page's own figures, never its own numbers.",
  category: "KNOWLEDGE",
  authMode: "NONE",
  tenantAvailability: "GLOBAL",
  requiredScopes: ["company:read"],
  requiredSecretRefs: [],
  toolDefinitions: [
    {
      name: "Redraw a chart from this page",
      description:
        "Redraws one of the charts on the page this conversation started on (they are listed by number under THE PAGE THIS CONVERSATION STARTED ON) another way, under your answer: bars to rank its rows, a pie for shares, a line for anything by day, stacked bars, or a map of boxes, each row a box sized by the measure, orange if it went up against the period before and grey if it went down; the top so many; one of its columns of figures as the measure, and another set beside it as the period before. Use it when someone asks to see a chart on this page differently. It draws from the page's own figures, never yours, and returns them for your words. One chart to an answer. For anything the page doesn't show, use show_chart.",
      handlerMapping: "assistant.pageChart",
      modelName: "redraw_page_chart",
      requiredRole: "ADMIN",
      sideEffectLevel: "READ",
      confirmationRequired: false,
      inputSchema: JSON.stringify({
        type: "object",
        required: ["chart"],
        properties: {
          chart: { type: "number", description: "The chart's number on the page, as listed." },
          kind: { type: "string", enum: ["bars", "pie", "line", "stacked", "map"], description: "bars (rows ranked, the default), pie (shares), line (rows by day, in the page's order), stacked, or map (boxes sized by the measure; give against to colour them by up or down)." },
          measure: { type: "string", description: "The column of figures to draw, by its name as listed. Leave out for the chart's first column of figures." },
          against: { type: "string", description: "Another column of figures to set beside it as the period before, by its name as listed." },
          top: { type: "number", description: "Draw only the biggest so many rows, e.g. 10." },
          only: { type: "string", description: "Only one thing's rows, by its name as the chart says it: a page's routes on a route chart, each bar then named by the page it went to or came from." },
        },
      }),
    },
  ],
};
