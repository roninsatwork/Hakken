import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { act, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

import InspectKnowledgeDocumentPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

const routeParams = {
  id: "company_1" as Id<"companies">,
  documentId: "document_1" as Id<"knowledgeDocuments">,
};
const params = Object.assign(
  Promise.resolve(routeParams),
  {
    status: "fulfilled",
    value: routeParams,
  },
);

describe("InspectKnowledgeDocumentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the existing spinner while the inspection query is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<InspectKnowledgeDocumentPage params={params} />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(useQuery).toHaveBeenCalledWith(
      expect.anything(),
      { documentId: "document_1" },
    );
  });

  it("renders the unchanged not-found state after the query resolves", async () => {
    vi.mocked(useQuery).mockReturnValue(null);

    await act(async () => {
      render(<InspectKnowledgeDocumentPage params={params} />);
      await import("./KnowledgeDocumentContent");
    });

    expect(screen.getByText("This document could not be inspected.")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/admin/companies/company_1/ai/knowledge",
    );
  });

  it("renders the complete inspection after the query resolves", async () => {
    vi.mocked(useQuery).mockReturnValue({
      document: {
        title: "Policies handbook",
        status: "ready",
        format: "pdf",
        sourceUrl: "https://example.com/policies.pdf",
        lastIngestionError: undefined,
        embeddingModelId: "text-embedding",
        embeddingProviderModelId: "provider-model",
        embeddingDimensions: 768,
        createdAt: 1_700_000_000_000,
        lastQueuedAt: undefined,
        lastIngestionStartedAt: undefined,
        lastIngestedAt: 1_700_000_060_000,
      },
      chunkCount: 1,
      activeEmbeddingModel: {
        modelId: "text-embedding",
        providerModelId: "provider-model",
        embeddingDimensions: 768,
      },
      safetyNotice: "Stored content remains tenant scoped.",
      embeddingDrift: null,
      history: [],
      chunks: [
        {
          chunkId: "chunk_1",
          index: 0,
          characterCount: 42,
          embeddingDimensions: 768,
          preview: "The complete document preview.",
        },
      ],
    } as unknown as ReturnType<typeof useQuery>);

    await act(async () => {
      render(<InspectKnowledgeDocumentPage params={params} />);
      await import("./KnowledgeDocumentContent");
    });

    expect(screen.getByText("Policies handbook")).toBeInTheDocument();
    expect(screen.getByText("Stored content remains tenant scoped.")).toBeInTheDocument();
    expect(screen.getByText("The complete document preview.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example.com\/policies.pdf/i })).toHaveAttribute(
      "href",
      "https://example.com/policies.pdf",
    );
  });
});
