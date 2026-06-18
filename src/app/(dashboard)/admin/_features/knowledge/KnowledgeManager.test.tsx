import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { KnowledgeManager } from "./KnowledgeManager";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

describe("KnowledgeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "knowledge:getQualitySummary") {
        return {
          totals: {
            documents: 1,
            ready: 1,
            pending: 0,
            processing: 0,
            failed: 0,
            flagged: 0,
            embeddingDrift: 0,
            sampledChunks: 1,
            readyCoverage: 1,
          },
          topicCoverage: {
            score: 0.5,
            coveredCount: 1,
            totalCount: 2,
            readyDocumentCount: 1,
            terms: [
              { term: "renewal", covered: true },
              { term: "expansion", covered: false },
            ],
            recommendation: "Add or repair knowledge for missing agent-purpose topics before release.",
          },
          flaggedDocuments: [],
        } as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useAction).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useAction>);
  });

  it("renders agent topic coverage guidance for release review", () => {
    render(
      <KnowledgeManager
        scope={{ type: "agent", agentId: "agent_1" as Id<"agents"> }}
        header={<div>Agent Knowledge</div>}
        emptyDocumentDescription="No documents"
        deleteDocumentDescription={(title) => `Delete ${title || "document"}`}
      />
    );

    expect(screen.getByText("Agent topic coverage")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("renewal")).toBeInTheDocument();
    expect(screen.getByText("expansion")).toBeInTheDocument();
    expect(screen.getByText(/1\/2 topics covered across 1 ready document/)).toBeInTheDocument();
    expect(screen.getByText(/Add or repair knowledge for missing agent-purpose topics before release/)).toBeInTheDocument();
  });
});
