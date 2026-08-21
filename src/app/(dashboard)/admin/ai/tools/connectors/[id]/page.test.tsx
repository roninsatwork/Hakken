import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { expectStandardFormScreen } from "@/src/test/standardFormScreen";
import ConnectorSetupPage from "./page";

// The screen reads the configured platform name, so copy is branded per
// deployment rather than carrying a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));


vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "connector_1" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/src/context/ToastContext", () => ({
  useToast: () => ({ showErrorToast: vi.fn() }),
  // renderWithProviders mounts the provider, so the mocked module has to
  // export it too — as a pass-through.
  ToastProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

const baseDetails = {
  connector: {
    _id: "connector_1",
    key: "sonae-knowledge",
    // Deliberately stale: the name and description are copied into the install
    // row at install time and never updated afterwards.
    name: "Sonae Knowledge",
    description: "Search approved tenant knowledge through the governed RAG path.",
    configuredSecretRefs: [],
    enabledToolMappings: ["knowledge.search"],
    isActive: true,
    tenantAvailability: "GLOBAL",
    companyId: undefined,
  },
  definition: {
    key: "sonae-knowledge",
    name: "Knowledge search",
    description: "Lets an agent search the documents you have uploaded, and quote from them.",
    requiredSecretRefs: [] as string[],
    toolDefinitions: [
      {
        name: "Knowledge Search",
        description: "Searches your approved documents and returns short quotes with their source.",
        handlerMapping: "knowledge.search",
      },
    ],
  },
  canManageTenantScope: true,
  tools: [] as Array<{ _id: string; name: string; isActive?: boolean }>,
  testLogs: [] as Array<{ status: string; message: string; testedAt: number }>,
};

describe("ConnectorSetupPage", () => {
  const mutationMock = vi.fn();
  let details: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    details = baseDetails;
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const name = getFunctionName(queryFn);
      if (name === "aiTools:getConnectorInstallDetails") return details as ReturnType<typeof useQuery>;
      return [] as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
    mutationMock.mockResolvedValue(undefined);
  });

  /**
   * Name and description are frozen into the install row at install time.
   * Reading them from there meant renaming a tool left every existing install
   * showing its old name for ever — which is exactly what happened when these
   * four were rewritten into plain English.
   */
  it("shows the tool's current name, not the one frozen at install", () => {
    render(<ConnectorSetupPage />);

    expect(screen.getByRole("heading", { name: "Knowledge search" })).toBeInTheDocument();
    expect(screen.queryByText(/governed RAG path/)).not.toBeInTheDocument();
  });

  it("states each setting once, as a switch", () => {
    render(<ConnectorSetupPage />);

    expect(screen.getByRole("switch", { name: "Available to agents" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Knowledge Search" })).toHaveAttribute("aria-checked", "true");
  });

  it("saves what was changed", async () => {
    render(<ConnectorSetupPage />);

    fireEvent.click(screen.getByRole("switch", { name: "Knowledge Search" }));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith(expect.objectContaining({
        connectorId: "connector_1",
        enabledToolMappings: [],
        isActive: true,
      }));
    });
  });

  /**
   * The old screen drew the secrets box on every connector, including the ones
   * that answered "No secret references are required" directly underneath it.
   */
  it("asks for keys only when the tool actually needs them", () => {
    render(<ConnectorSetupPage />);
    expect(screen.queryByLabelText("Keys it needs")).not.toBeInTheDocument();
  });

  it("meets the floor every form screen has to clear", () => {
    details = {
      ...baseDetails,
      definition: { ...baseDetails.definition, requiredSecretRefs: ["base_url"] },
    };
    render(<ConnectorSetupPage />);

    expectStandardFormScreen();
  });

  it("names the keys a tool needs, and says which are still missing", () => {
    details = {
      ...baseDetails,
      definition: { ...baseDetails.definition, requiredSecretRefs: ["base_url", "auth_header"] },
    };
    render(<ConnectorSetupPage />);

    expect(screen.getByLabelText("Keys it needs")).toBeInTheDocument();
    expect(screen.getByText(/Still missing: base_url, auth_header/)).toBeInTheDocument();
  });

  it("answers whether it works in one line, rather than a log", () => {
    details = {
      ...baseDetails,
      testLogs: [{ status: "SUCCESS", message: "Connection test passed.", testedAt: Date.UTC(2026, 5, 16, 10) }],
    };
    render(<ConnectorSetupPage />);

    expect(screen.getByText("Working.")).toBeInTheDocument();
  });

  it("says plainly when nothing has been checked yet", () => {
    render(<ConnectorSetupPage />);
    expect(screen.getByText("Not checked yet.")).toBeInTheDocument();
  });

  it("runs a check when asked", async () => {
    render(<ConnectorSetupPage />);

    fireEvent.click(screen.getByRole("button", { name: "Check now" }));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith({ connectorId: "connector_1" });
    });
  });
});
