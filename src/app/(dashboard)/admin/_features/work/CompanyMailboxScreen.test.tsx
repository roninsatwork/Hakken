import React from "react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { CompanyMailboxScreen } from "./CompanyMailboxScreen";

// The screen reads the configured platform name, so copy is branded per
// deployment rather than carrying a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));


/**
 * Pins what the company mailbox does today, before it moves onto the shared
 * list part.
 *
 * `usePaginatedQuery` is mocked rather than `useServerPagedTable`, so the real
 * page-number bridge runs — that hook is the thing most likely to break when
 * the screen moves, and mocking it out would hide exactly that.
 */

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  // renderWithProviders wraps every screen in the provider, so the mocked
  // module has to export it too — as a pass-through.
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const messages = [
  {
    _id: "mail_quote",
    sender: "hello@acme.co.uk",
    subject: "Can you quote for 40 doors?",
    decision: "REPLIED",
    decisionReason: "Answered from the price list.",
    decisions: [],
    createdAt: Date.UTC(2026, 7, 14, 9, 30),
  },
  {
    _id: "mail_invoice",
    sender: "accounts@brightsite.com",
    subject: "Invoice 4021 query",
    decision: "TASK",
    decisionReason: "Raised for a person to check.",
    decisions: [],
    createdAt: Date.UTC(2026, 7, 15, 11, 5),
  },
];

describe("CompanyMailboxScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<CompanyMailboxScreen companyId={"company123" as Id<"companies">} />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue({
          results: rows ?? [],
          status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
          isLoading: rows === undefined,
          loadMore: vi.fn(),
        } as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: messages,
      sampleRowText: "Can you quote for 40 doors?",
      emptyText: "aiMailbox.emptyState",
      searchPlaceholder: "aiMailbox.searchPlaceholder",
    });
  });
});
