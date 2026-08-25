import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuditLogDetail from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", () => ({ useParams: vi.fn() }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/dynamic", async () => {
  const { default: AuditLogDetailContent } = await import("./AuditLogDetailContent");
  return { default: () => AuditLogDetailContent };
});

const log = {
  _id: "audit_1",
  actionType: "UPDATE_COMPANY",
  actorName: "Anthony Basker",
  entityId: "company_1",
  timestamp: Date.UTC(2026, 7, 25, 9, 0),
  metadata: '{"field":"security_policy","status":"enforced"}',
};

describe("legacy AuditLogDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ id: "audit_1" });
  });

  it("keeps the existing spinner while the audit query is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    const { container } = render(<AuditLogDetail />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("UPDATE_COMPANY")).not.toBeInTheDocument();
  });

  it("renders the unchanged detail after the audit query answers", () => {
    vi.mocked(useQuery).mockReturnValue([log] as unknown as ReturnType<typeof useQuery>);
    render(<AuditLogDetail />);
    expect(screen.getByText("UPDATE_COMPANY")).toBeInTheDocument();
    expect(screen.getByText("Anthony Basker")).toBeInTheDocument();
    expect(screen.getByText(/security_policy/)).toBeInTheDocument();
  });

  it("keeps the existing empty-database fallback record", () => {
    vi.mocked(useParams).mockReturnValue({ id: "mock-log-1a2b3c" });
    vi.mocked(useQuery).mockReturnValue([] as unknown as ReturnType<typeof useQuery>);
    render(<AuditLogDetail />);
    expect(screen.getByText("Anthony (SuperAdmin)")).toBeInTheDocument();
    expect(screen.getByText("UPDATE_COMPANY")).toBeInTheDocument();
  });

  it("keeps the existing not-found state", () => {
    vi.mocked(useParams).mockReturnValue({ id: "missing" });
    vi.mocked(useQuery).mockReturnValue([log] as unknown as ReturnType<typeof useQuery>);
    render(<AuditLogDetail />);
    expect(screen.getByText("admin.auditLogs.detailPage.error.title")).toBeInTheDocument();
    expect(screen.getByText("admin.auditLogs.detailPage.error.message")).toBeInTheDocument();
  });
});
