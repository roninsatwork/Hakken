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

  it("lists the keys you have, in words", () => {
    renderWithProviders(<ApiKeysPage />);

    expect(screen.getByRole("heading", { name: "API Keys" })).toBeInTheDocument();
    expect(screen.getByText("Production agent trigger")).toBeInTheDocument();
    expect(screen.getByText("Working")).toBeInTheDocument();
    // The row spells the permissions out, rather than printing "agent:run".
    expect(screen.getByText("Start an agent, Check on a run")).toBeInTheDocument();
  });

  /**
   * The company select opened on "All companies", which is not a thing a key
   * can be — every key belongs to exactly one. The form's default state could
   * not be submitted.
   */
  it("asks which company the key is for, rather than defaulting to none", async () => {
    renderWithProviders(<ApiKeysPage />);

    expect(screen.getByRole("combobox", { name: "Which company is it for?" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /Create key/ }));

    await waitFor(() => {
      expect(screen.getByText("Choose which company this key is for.")).toBeInTheDocument();
    });
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it("creates a key and shows the secret once", async () => {
    renderWithProviders(<ApiKeysPage />);

    fireEvent.change(screen.getByRole("combobox", { name: "Which company is it for?" }), {
      target: { value: "company_1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Website contact form"), {
      target: { value: "Warehouse trigger" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create key/ }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith(expect.objectContaining({
        companyId: "company_1",
        name: "Warehouse trigger",
        scopes: ["agent:run", "run:read"],
        rateLimitPerMinute: 60,
      }));
    });
    expect(screen.getByText("sonae_newsecret_abcdef")).toBeInTheDocument();
    expect(screen.getByText(/only time it will be shown/)).toBeInTheDocument();
  });

  /** The field opened empty, so the obvious key never stopped working. */
  it("gives a new key an expiry rather than leaving it forever", async () => {
    renderWithProviders(<ApiKeysPage />);

    expect(screen.getByLabelText("Stops working on")).not.toHaveValue("");

    fireEvent.change(screen.getByRole("combobox", { name: "Which company is it for?" }), {
      target: { value: "company_1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Website contact form"), { target: { value: "Key" } });
    fireEvent.click(screen.getByRole("button", { name: /Create key/ }));

    await waitFor(() => {
      const payload = createApiKey.mock.calls.at(-1)?.[0] as { expiresAt?: number };
      expect(payload.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  /**
   * "Webhook delivery — use future callback delivery surfaces" was offered as a
   * permission. No endpoint has ever checked it, so it granted access to
   * nothing.
   */
  it("does not offer a permission that grants nothing", () => {
    renderWithProviders(<ApiKeysPage />);

    expect(screen.queryByRole("switch", { name: /Webhook/ })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Start an agent" })).toBeInTheDocument();
  });

  it("warns what turning a key off means, and asks first", async () => {
    renderWithProviders(<ApiKeysPage />);

    fireEvent.click(screen.getByRole("button", { name: "Turn off Production agent trigger" }));
    expect(screen.getByText(/stops working straight away/)).toBeInTheDocument();
    expect(revokeApiKey).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("No longer needed"), {
      target: { value: "Rotated after launch." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turn it off" }));

    await waitFor(() => {
      expect(revokeApiKey).toHaveBeenCalledWith({
        apiKeyId: "api_key_1",
        reason: "Rotated after launch.",
      });
    });
  });
});
