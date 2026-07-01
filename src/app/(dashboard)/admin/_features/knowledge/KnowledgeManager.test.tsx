import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { KnowledgeManager } from "./KnowledgeManager";
import type { Doc, Id } from "@/convex/_generated/dataModel";

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
      if (functionName === "knowledge:getWebsiteDocuments") {
        return [] as unknown as ReturnType<typeof useQuery>;
      }
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

  it("labels website counts from the full website document set", () => {
    const websiteDocuments = Array.from({ length: 15 }, (_, index) => ({
      _id: `doc_${index}` as Id<"knowledgeDocuments">,
      _creationTime: index,
      title: `Page ${index + 1}`,
      sourceUrl: `https://example.com/page-${index + 1}`,
      status: "ready",
      format: "url",
      companyId: "company_1" as Id<"companies">,
      createdBy: "user_1" as Id<"users">,
      createdAt: index,
    })) as Array<Doc<"knowledgeDocuments">>;

    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: websiteDocuments,
      status: "CanLoadMore",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "knowledge:getWebsiteDocuments") {
        return websiteDocuments as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "knowledge:getQualitySummary") {
        return {
          totals: {
            documents: 148,
            ready: 148,
            pending: 0,
            processing: 0,
            failed: 0,
            flagged: 0,
            embeddingDrift: 0,
            sampledChunks: 1622,
            readyCoverage: 1,
          },
          topicCoverage: null,
          flaggedDocuments: [],
        } as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });

    render(
      <KnowledgeManager
        scope={{ type: "company", companyId: "company_1" as Id<"companies"> }}
        header={<div>Company Knowledge</div>}
        emptyDocumentDescription="No documents"
        deleteDocumentDescription={(title) => `Delete ${title || "document"}`}
      />
    );

    expect(screen.getByText("Website pages are grouped by domain. Search filters the pages stored for this website source.")).toBeInTheDocument();
    expect(screen.getByText("15 ready / 15 stored (100%)")).toBeInTheDocument();
    expect(screen.getByText("15 pages")).toBeInTheDocument();
    expect(screen.getByText("Showing 15 loaded of 148 total knowledge documents")).toBeInTheDocument();
  });

  it("filters expanded website groups by loaded page URL", () => {
    const websiteDocuments = [
      {
        _id: "doc_1" as Id<"knowledgeDocuments">,
        _creationTime: 1,
        title: "Ecommerce",
        sourceUrl: "https://example.com/case-study-category/ecommerce",
        status: "ready",
        format: "url",
        companyId: "company_1" as Id<"companies">,
        createdBy: "user_1" as Id<"users">,
        createdAt: 1,
      },
      {
        _id: "doc_2" as Id<"knowledgeDocuments">,
        _creationTime: 2,
        title: "Brand audit",
        sourceUrl: "https://example.com/hub/brand-audit",
        status: "pending",
        format: "url",
        companyId: "company_1" as Id<"companies">,
        createdBy: "user_1" as Id<"users">,
        createdAt: 2,
      },
      {
        _id: "doc_3" as Id<"knowledgeDocuments">,
        _creationTime: 3,
        title: "AI consultancy",
        sourceUrl: "https://example.com/ai-consultancy",
        status: "pending",
        format: "url",
        companyId: "company_1" as Id<"companies">,
        createdBy: "user_1" as Id<"users">,
        createdAt: 3,
      },
    ] as Array<Doc<"knowledgeDocuments">>;

    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "knowledge:getWebsiteDocuments") {
        return websiteDocuments as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "knowledge:getQualitySummary") {
        return {
          totals: {
            documents: 3,
            ready: 1,
            pending: 2,
            processing: 0,
            failed: 0,
            flagged: 0,
            embeddingDrift: 0,
            sampledChunks: 1,
            readyCoverage: 1 / 3,
          },
          topicCoverage: null,
          flaggedDocuments: [],
        } as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });

    render(
      <KnowledgeManager
        scope={{ type: "company", companyId: "company_1" as Id<"companies"> }}
        header={<div>Company Knowledge</div>}
        emptyDocumentDescription="No documents"
        getInspectDocumentHref={(documentId) => `/admin/companies/company_1/ai/knowledge/${documentId}`}
        deleteDocumentDescription={(title) => `Delete ${title || "document"}`}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "3 pages" }));
    fireEvent.change(screen.getByPlaceholderText("Search stored pages"), { target: { value: "hub" } });

    expect(screen.getByText("1 matching stored page")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/hub/brand-audit")).toBeInTheDocument();
    expect(screen.getByTitle("Inspect chunks")).toHaveAttribute(
      "href",
      "/admin/companies/company_1/ai/knowledge/doc_2"
    );
    expect(screen.queryByText("https://example.com/case-study-category/ecommerce")).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.com/ai-consultancy")).not.toBeInTheDocument();
  });
});
