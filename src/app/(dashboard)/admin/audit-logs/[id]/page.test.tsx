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

  /**
   * This test used to assert the opposite, and that is the point of keeping it.
   *
   * The screen carried four hand-written records and showed them whenever the
   * real query came back empty — a super-admin enforcing a security policy, a
   * user deleted for a terms violation, each with a plausible actor, timestamp
   * and reference. A test named "keeps the existing empty-database fallback
   * record" held that in place, so the invention was not an oversight anybody
   * would trip over: it was pinned.
   *
   * An empty audit trail is a fact about the system, and the only honest thing
   * to render. The ids below are the ones the fabricated rows used, so this
   * fails the moment any of them come back.
   */
  it.each(["mock-log-1a2b3c", "mock-log-4d5e6f", "mock-log-7g8h9i", "mock-log-xjx9a1"])(
    "invents no record for %s when the audit trail is empty",
    (fabricatedId) => {
      vi.mocked(useParams).mockReturnValue({ id: fabricatedId });
      vi.mocked(useQuery).mockReturnValue([] as unknown as ReturnType<typeof useQuery>);
      render(<AuditLogDetail />);

      expect(
        screen.getByText("admin.auditLogs.detailPage.error.title"),
        "an empty audit trail must read as empty, not as four events that never happened"
      ).toBeInTheDocument();
      expect(screen.queryByText("Anthony (SuperAdmin)")).not.toBeInTheDocument();
      expect(screen.queryByText("UPDATE_COMPANY")).not.toBeInTheDocument();
      expect(screen.queryByText(/security_policy/)).not.toBeInTheDocument();
    }
  );

  it("keeps the existing not-found state", () => {
    vi.mocked(useParams).mockReturnValue({ id: "missing" });
    vi.mocked(useQuery).mockReturnValue([log] as unknown as ReturnType<typeof useQuery>);
    render(<AuditLogDetail />);
    expect(screen.getByText("admin.auditLogs.detailPage.error.title")).toBeInTheDocument();
    expect(screen.getByText("admin.auditLogs.detailPage.error.message")).toBeInTheDocument();
  });
});
