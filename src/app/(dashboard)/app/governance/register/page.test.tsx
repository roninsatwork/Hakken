import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import AiRegisterPage from "./page";

/**
 * Pins what the customer's own AI register does today, before it moves onto the
 * shared list part. Same note as the customer policies screen: no search and no
 * page numbers, where the platform's version of the same screen has both.
 */

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const entries = [
  {
    id: "agent_examiner",
    name: "The Examiner",
    purpose: "Drafts exam questions from real asked questions.",
    kind: "AGENT",
    risk: "MEDIUM",
    ownerName: "Anthony Basker",
    humanApproves: true,
    facesPublic: false,
    model: "Test Model",
    missing: [],
    lastActiveAt: Date.UTC(2026, 7, 14),
  },
  {
    id: "agent_greeter",
    name: "Reception greeter",
    purpose: "Answers visitors at the front desk.",
    kind: "AGENT",
    risk: "UNRATED",
    ownerName: "",
    humanApproves: false,
    facesPublic: true,
    model: undefined,
    missing: ["No owner recorded."],
    lastActiveAt: undefined,
  },
];

const summary = {
  total: 2,
  incomplete: 1,
  unrated: 1,
  highRisk: 0,
  publicFacing: 1,
  unattended: 1,
};

describe("AiRegisterPage (customer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<AiRegisterPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockReturnValue(rows === undefined ? undefined : { entries: rows, summary });
      },
      sampleRows: entries,
      sampleRowText: "The Examiner",
      emptyText: "admin.governance.register.empty",
      hasFooter: false,
    });
  });
});
