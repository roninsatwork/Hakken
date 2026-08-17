import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import AiRegisterPage from "./page";

/**
 * The workspace AI register, on the shared list part. It used to carry six
 * summary boxes and nothing else — no search, no filters, no page numbers —
 * where the platform's version had all three; Anthony closed that gap on
 * 2026-08-17, so the same assertions now run against both screens.
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
      searchPlaceholder: "admin.governance.register.searchPlaceholder",
    });
  });
});
