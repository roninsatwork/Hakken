import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import GovernancePoliciesPage from "./page";

/**
 * Pins what the customer's own policies list does today, before it moves onto
 * the shared list part.
 *
 * `hasFooter: false` records a fact rather than approving it: this screen shows
 * every active rule at once, with no search and no page numbers, while the
 * platform's version of the same screen has both. That gap is written up in the
 * plan; the point of pinning it here is that the conversion has to change it
 * deliberately rather than by accident.
 */

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const rules = [
  {
    _id: "rule_grounded",
    name: "Stay grounded in approved context",
    isActive: true,
    priority: 10,
    instruction: "Answer only from approved company documents.",
    agentId: undefined,
    companyId: "company123",
  },
  {
    _id: "rule_handover",
    name: "Hand over pricing questions",
    isActive: true,
    priority: 20,
    instruction: "Offer a handover rather than quoting a price.",
    agentId: undefined,
    companyId: "company123",
  },
];

describe("GovernancePoliciesPage (customer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<GovernancePoliciesPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockReturnValue(rows);
      },
      sampleRows: rules,
      sampleRowText: "Stay grounded in approved context",
      emptyText: "admin.governance.policies.empty",
      hasFooter: false,
    });
  });
});
