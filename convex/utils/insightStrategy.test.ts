import { describe, expect, test } from "vitest";
import { applyServiceCalls, carryServices, rankedServices, serviceReading, servicesForAssistant, servicesToCall, serviceValidator, type Service } from "./insightStrategy";

/**
 * Strategy's call for each service (insightStrategy.ts; insights-one-voice-plan.md
 * phase 3): the rule's call first, the Head of Strategy's kept where the rule
 * calls a service the same, its answers held to the calls a service can have.
 */

const service = (page: string, figures: Partial<Service> = {}): Omit<Service, "verdict"> => ({
  page, title: page.slice(1, -1), kind: "SERVICE", enquiries: 6, enquiriesBefore: 4, visits: 300, people: 250, clicks: 40, clicksBefore: 30, impressions: 4_000, impressionsBefore: 3_000, ...figures,
});
const ruled = () => rankedServices([
  service("/web-design-london/"),
  service("/app-developers-london/", { enquiries: 2, enquiriesBefore: 12 }),
  service("guides", { kind: "GUIDES", title: null, enquiries: 1, enquiriesBefore: 1 }),
  service("/seo-agency/", { enquiries: 0, enquiriesBefore: 1, clicks: 3 }),
]).map((row) => ({ ...row, signature: serviceReading(row), decidedBy: "RULE" as const }));

describe("Strategy's call for each service", () => {
  test("is kept with who called it and why", () => {
    expect(Object.keys(serviceValidator.fields)).toEqual(expect.arrayContaining(["decidedBy", "decidedWeek", "why", "signature"]));
  });

  test("the Head of Strategy calls the services that brought an enquiry this year, never the guides, within the calls a service can have", () => {
    const rows = ruled();
    const asked = servicesToCall(rows);
    expect(asked.map((row) => row.page)).toEqual(["/web-design-london/", "/app-developers-london/"]);
    const applied = applyServiceCalls(asked, [
      { page: "/app-developers-london/", call: "GROW", why: "Mobile app searches are growing nationally, and its London searches still bring work." },
      // For readers is the guides' call; a page it wasn't given; and a call with no reason: each refused.
      { page: "/web-design-london/", call: "READERS", why: "…" },
      { page: "/elsewhere/", call: "GROW", why: "…" },
      { page: "/web-design-london/", call: "STEADY" },
    ], "2026-10-12");
    expect(applied).toEqual({ changed: 1, kept: 0, refused: 3 });
    expect(rows.find((row) => row.page === "/app-developers-london/")).toMatchObject({ verdict: "GROW", decidedBy: "AGENT", decidedWeek: "2026-10-12" });
    expect(rows.find((row) => row.page === "/web-design-london/")).toMatchObject({ verdict: "GROW", decidedBy: "RULE" });
    // A service with no enquiry this year keeps the rule's call, said to be the rule's.
    expect(rows.find((row) => row.page === "/seo-agency/")).toMatchObject({ verdict: "YOUR_CALL", decidedBy: "RULE" });
    expect(servicesForAssistant(rows).services.find((row) => row.page === "/seo-agency/")).toMatchObject({ called_by: "the rule" });
  });

  test("next week, a service the rule calls the same keeps the Head of Strategy's call; Ask Hakken reads them as kept", () => {
    const last = ruled();
    applyServiceCalls(servicesToCall(last), [{ page: "/app-developers-london/", call: "GROW", why: "Mobile app searches are growing." }], "2026-10-05");
    const now = ruled();
    expect(carryServices(now, last)).toBe(1);
    expect(now.find((row) => row.page === "/app-developers-london/")).toMatchObject({ verdict: "GROW", decidedWeek: "2026-10-05" });
    expect(servicesToCall(now).map((row) => row.page)).toEqual(["/web-design-london/"]);
    expect(servicesForAssistant(now).services).toEqual(expect.arrayContaining([
      { service: "app-developers-london", page: "/app-developers-london/", call: "grow it", why: "Mobile app searches are growing.", called_by: "the Head of Strategy, on 2026-10-05" },
    ]));
  });
});
