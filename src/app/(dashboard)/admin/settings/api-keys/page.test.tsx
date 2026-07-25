import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import ApiKeysPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

const companies = [
  { _id: "company_1", name: "Acme" },
  { _id: "company_2", name: "Beta" },
];

const apiKeys = [
  {
    _id: "api_key_1",
    _creationTime: 1,
    companyId: "company_1",
    companyName: "Acme",
    name: "Production agent trigger",
    keyPrefix: "sonae_abc123def456",
    scopes: ["agent:run", "run:read"],
    status: "ACTIVE",
    rateLimitPerMinute: 60,
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18, 10),
  },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("ApiKeysPage", () => {
  const createApiKey = vi.fn();
  const revokeApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn: unknown, args?: unknown) => {
      void args;
      const path = getConvexPath(queryFn);
      if (path.includes("companies:getCompanyOptions")) return companies as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: apiKeys,
      status: "Exhausted",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("apiKeys:create")) return createApiKey as unknown as ReturnType<typeof useMutation>;
      return revokeApiKey as unknown as ReturnType<typeof useMutation>;
    });
    createApiKey.mockResolvedValue({
      apiKey: "sonae_newsecret_abcdef",
      record: { keyPrefix: "sonae_newsecret" },
    });
    revokeApiKey.mockResolvedValue(undefined);
  });

  it("renders API key inventory and creates a one-time secret", async () => {
    renderWithProviders(<ApiKeysPage />);

    expect(screen.getByText("API Keys")).toBeInTheDocument();
    expect(screen.getByText("Production agent trigger")).toBeInTheDocument();
    expect(screen.getByText("sonae_abc123def456")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "company_1" } });
    fireEvent.change(screen.getByPlaceholderText("Production agent trigger"), { target: { value: "Warehouse trigger" } });
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith({
        companyId: "company_1",
        name: "Warehouse trigger",
        scopes: ["agent:run", "run:read"],
        rateLimitPerMinute: 60,
      });
    });
    expect(screen.getByText("sonae_newsecret_abcdef")).toBeInTheDocument();
  });

  it("revokes an active API key with an in-app reason", async () => {
    renderWithProviders(<ApiKeysPage />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByPlaceholderText("Rotated, leaked, no longer needed..."), {
      target: { value: "Rotated after launch." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));

    await waitFor(() => {
      expect(revokeApiKey).toHaveBeenCalledWith({
        apiKeyId: "api_key_1",
        reason: "Rotated after launch.",
      });
    });
  });
});
