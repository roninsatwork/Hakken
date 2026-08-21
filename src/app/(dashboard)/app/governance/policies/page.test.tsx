import React from "react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import GovernancePoliciesPage from "./page";

/**
 * Pins what the customer's own policies list does today, before it moves onto
 * the shared list part.
 *
 * It used to have no search box and no page numbers where the platform's version
 * of the same screen had both, and that was pinned here as a fact rather than an
 * endorsement. Anthony closed the gap on 2026-08-17, so the same assertions now
 * run against both screens.
 */

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  // renderWithProviders wraps every screen in the provider, so the mocked
  // module has to export it too — as a pass-through.
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
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
      searchPlaceholder: "admin.governance.policies.searchPlaceholder",
    });
  });
});
