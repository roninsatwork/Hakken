import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, describe, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import AutoSetupPage from "./auto-setup/page";

/**
 * Auto Setup's page under Setup holds to the looks Anthony chose on the "Auto
 * Setup" canvas, 2026-10-19 (docs/plans/active/auto-setup-plan.md, boards 1–3
 * as redrawn that day after "this looks nasty", and built on his "Go";
 * design-drift-plan D4): rendered in English, it reads as the outline saved in
 * docs/plans/assets/auto-setup/look/.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "auto-setup";
const LIMITS = { pages: 6, webSearches: 10, searches: 25, questions: 10, runCapUsd: 2, dayCapUsd: 10 };
const row = (id: string, kind: string, name: string, state: string) => ({
  id, kind, name, against: kind === "RIVAL" ? "nec.ac.uk" : null,
  names: kind === "COMPANY" ? "NONE" : state, namesCount: 0,
  profile: kind === "RIVAL" ? "NONE" : state,
  searches: kind === "OWN" ? state : "NONE", searchesCount: 0,
  questions: kind === "OWN" ? state : "NONE", questionsCount: 0,
  countries: kind === "OWN" ? state : "NONE",
});
const rows = (state: string) => [row("company_1", "COMPANY", "National Extension College", state), row("hold_1", "OWN", "nec.ac.uk", state), row("hold_2", "RIVAL", "wolseyhalloxford.org.uk", state)];
const showing = (status: unknown) => vi.mocked(useQuery).mockImplementation(answerQueries({ "autoSetupStart:autoSetupStatus": status }));

afterEach(cleanup);

describe("Auto Setup's approved looks", () => {
  it("Main — the orange Run Auto Setup, what is empty and a run's limits, and every box", async () => {
    showing({ readiness: "ON", agentId: "agent_1", rows: rows("EMPTY"), limits: LIMITS, run: null });
    const { container } = render(<AutoSetupPage />);
    await screen.findByText("nec.ac.uk");
    await expectApprovedLook(container, PLAN, "Main", "Company → Websites → Auto Setup, ready");
  });

  it("Running — how far it has got, a bar moving with each piece of work, what it is doing now, and the boxes being written", async () => {
    showing({ readiness: "ON", agentId: "agent_1", rows: rows("WRITING"), limits: LIMITS, run: { status: "WORKING", total: 3, done: 1, pieces: 9, piecesDone: 7, doing: { what: "READ_RIVALS", host: null, at: null, of: 1 }, finishedAt: null, stopped: null, agentRunId: "run_1", costUsd: 0.1, forPerson: [] } });
    const { container } = render(<AutoSetupPage />);
    await screen.findByText("nec.ac.uk");
    await expectApprovedLook(container, PLAN, "Running", "Company → Websites → Auto Setup, running");
  });

  it("Done — what it cost, what is left for a person, and every box", async () => {
    showing({ readiness: "ON", agentId: "agent_1", rows: rows("HAKKEN"), limits: LIMITS, run: { status: "DONE", total: 3, done: 3, pieces: 9, piecesDone: 9, doing: null, finishedAt: 1, stopped: null, agentRunId: "run_1", costUsd: 0.35, forPerson: ["COLLECTION"] } });
    const { container } = render(<AutoSetupPage />);
    await screen.findByText("nec.ac.uk");
    await expectApprovedLook(container, PLAN, "Done", "Company → Websites → Auto Setup, done");
  });
});
