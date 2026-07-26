import React from "react";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyAiMemoryPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1" }),
}));

const memories = [
  {
    _id: "memory_always",
    companyId: "company_1",
    title: "No delivery dates",
    content: "Never promise a delivery date over chat.",
    normalizedContent: "never promise a delivery date over chat.",
    category: "OTHER",
    applyMode: "ALWAYS",
    status: "APPROVED",
    confidence: 0.8,
    sourceType: "MANUAL",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18, 9),
    updatedAt: Date.UTC(2026, 5, 18, 9),
    usageCount: 3,
  },
  {
    _id: "memory_legacy_tone",
    companyId: "company_1",
    title: "House tone",
    content: "Write plainly and never use jargon.",
    normalizedContent: "write plainly and never use jargon.",
    // No applyMode: a row the backfill has not reached. It must still read as
    // what its old category was saying.
    category: "TONE",
    status: "APPROVED",
    confidence: 0.8,
    sourceType: "MANUAL",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18, 9),
    updatedAt: Date.UTC(2026, 5, 18, 9),
    usageCount: 0,
  },
  {
    _id: "memory_relevant",
    companyId: "company_1",
    title: "Returns window",
    content: "Returns are accepted within 30 days of purchase.",
    normalizedContent: "returns are accepted within 30 days of purchase.",
    category: "OTHER",
    applyMode: "WHEN_RELEVANT",
    status: "APPROVED",
    confidence: 0.8,
    sourceType: "MANUAL",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18, 9),
    updatedAt: Date.UTC(2026, 5, 18, 9),
    usageCount: 0,
  },
];

const candidates = [
  {
    _id: "candidate_1",
    companyId: "company_1",
    title: "Weekend cover",
    content: "The support desk is closed at weekends.",
    normalizedContent: "the support desk is closed at weekends.",
    category: "OTHER",
    applyMode: "WHEN_RELEVANT",
    sourceType: "CHAT",
    reason: "Asked three times in last week's transcripts.",
    confidence: 0.7,
    status: "PROPOSED",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18, 9),
    updatedAt: Date.UTC(2026, 5, 18, 9),
  },
];

function mockPaginatedQueries(memoryResults: unknown[], candidateResults: unknown[]) {
  vi.mocked(usePaginatedQuery).mockImplementation((queryFn) => {
    const functionName = getFunctionName(queryFn);
    const results = functionName === "companyMemories:getCandidatesForCompany"
      ? candidateResults
      : memoryResults;
    return {
      results,
      status: "Exhausted",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>;
  });
}

describe("CompanyAiMemoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaginatedQueries(memories, candidates);
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
  });

  it("says of each memory whether it always applies", () => {
    render(<CompanyAiMemoryPage />);

    expect(screen.getByText("No delivery dates")).toBeInTheDocument();
    expect(screen.getByText("Returns window")).toBeInTheDocument();
    // Two Always: the stamped one and the legacy TONE row, which must not be
    // silently downgraded to "when relevant" before the backfill runs.
    expect(screen.getAllByText("Always")).toHaveLength(2);
    expect(screen.getAllByText("When relevant")).toHaveLength(1);
  });

  it("leads with the cap, because it is the one limit the reader can hit", () => {
    render(<CompanyAiMemoryPage />);

    expect(screen.getByText(/Up to 5 can apply to every answer/)).toBeInTheDocument();
  });

  it("shows suggestions as waiting rather than in force", () => {
    render(<CompanyAiMemoryPage />);

    expect(screen.getByText("Weekend cover")).toBeInTheDocument();
    expect(screen.getByText("Asked three times in last week's transcripts.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing here reaches the AI until it is approved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeInTheDocument();
  });

  it("names the empty states rather than showing a bare table", () => {
    mockPaginatedQueries([], []);
    render(<CompanyAiMemoryPage />);

    expect(screen.getByText(/No memories yet/)).toBeInTheDocument();
    expect(screen.getByText("Nothing waiting for review.")).toBeInTheDocument();
  });
});
