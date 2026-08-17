import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
    // The number that matters here is 148 — the true total, counted separately —
    // rather than the 15 fetched so far. The screen moved onto the house
    // numbered footer on 2026-08-17, so it now reads as a page range, but it is
    // still the full count it reports.
    expect(screen.getByText("Showing 1-15 of 148 documents")).toBeInTheDocument();
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

describe("KnowledgeManager bulk upload", () => {
  function mockUploadMutations() {
    const saveDocument = vi.fn().mockResolvedValue("doc_new");
    const startQueue = vi.fn().mockResolvedValue(undefined);
    const generateUploadUrl = vi.fn().mockResolvedValue("https://upload.test/put");

    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "knowledge:saveDocument") return saveDocument as never;
      if (functionName === "knowledge:startKnowledgeFileQueue") return startQueue as never;
      if (functionName === "knowledge:generateUploadUrl") return generateUploadUrl as never;
      return vi.fn() as never;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ storageId: "storage_1" }) }),
    );

    return { saveDocument, startQueue, generateUploadUrl };
  }

  function openUploadModal() {
    render(
      <KnowledgeManager
        scope={{ type: "global" }}
        header={<div />}
        emptyDocumentDescription="Upload documents"
        deleteDocumentDescription={() => <span />}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(screen.getByRole("button", { name: /Upload Document/ }));
  }

  function dropOf(files: File[]) {
    return {
      // No entry API, so the collector falls back to the flat `files` list.
      items: files.map(() => ({ webkitGetAsEntry: () => null })),
      files,
    } as unknown as DataTransfer;
  }

  it("offers a folder picker and says markdown is supported", () => {
    mockUploadMutations();
    openUploadModal();

    expect(screen.getByRole("button", { name: "Choose Folder" })).toBeInTheDocument();
    expect(screen.getByText(/\.MD/)).toBeInTheDocument();
    expect(screen.getByText(/OKF bundle/)).toBeInTheDocument();
  });

  it("defers ingestion for a batch and starts the drain queue once", async () => {
    const { saveDocument, startQueue } = mockUploadMutations();
    openUploadModal();

    const files = [
      new File(["# One"], "one.md", { type: "text/markdown" }),
      new File(["# Two"], "two.md", { type: "text/markdown" }),
      new File(["# Three"], "three.md", { type: "text/markdown" }),
    ];

    await act(async () => {
      fireEvent.drop(screen.getByText(/Drag & Drop Files or a Folder/).closest("div")!, {
        dataTransfer: dropOf(files),
      });
    });

    expect(saveDocument).toHaveBeenCalledTimes(3);
    expect(saveDocument.mock.calls.every(([args]) => args.deferIngestion === true)).toBe(true);
    expect(startQueue).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("3 files sent for processing")).toBeInTheDocument();
  });

  it("ingests a lone file immediately without touching the queue", async () => {
    const { saveDocument, startQueue } = mockUploadMutations();
    openUploadModal();

    await act(async () => {
      fireEvent.drop(screen.getByText(/Drag & Drop Files or a Folder/).closest("div")!, {
        dataTransfer: dropOf([new File(["# One"], "one.md", { type: "text/markdown" })]),
      });
    });

    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(saveDocument.mock.calls[0][0].deferIngestion).toBeUndefined();
    expect(startQueue).not.toHaveBeenCalled();
  });

  it("fails only the unsupported file and uploads the rest", async () => {
    const { saveDocument } = mockUploadMutations();
    openUploadModal();

    const files = [
      new File(["# Good"], "good.md", { type: "text/markdown" }),
      new File(["alert(1)"], "payload.js", { type: "text/javascript" }),
      new File(["# Also good"], "also-good.md", { type: "text/markdown" }),
    ];

    await act(async () => {
      fireEvent.drop(screen.getByText(/Drag & Drop Files or a Folder/).closest("div")!, {
        dataTransfer: dropOf(files),
      });
    });

    expect(saveDocument).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("2 of 3 uploaded, 1 failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry 1 failed" })).toBeInTheDocument();
    expect(screen.getByText(/Please upload PDF, CSV, Excel, Word, Markdown, or Text files/)).toBeInTheDocument();
  });
});
