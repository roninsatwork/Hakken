import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditTrailPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/dynamic", async () => {
  const { AuditLogsTable } = await import(
    "@/src/app/(dashboard)/admin/settings/_components/AuditLogsTable"
  );
  return { default: () => AuditLogsTable };
});

describe("workspace AuditTrailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the existing spinner while the tenant-scoped query is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<AuditTrailPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the existing audit table after the tenant-scoped query answers", () => {
    vi.mocked(useQuery).mockReturnValue([
      {
        _id: "audit_1",
        _creationTime: Date.UTC(2026, 7, 25, 9, 0),
        actionType: "LOGIN",
        actorId: "user_1",
        actorName: "Anthony Basker",
        entityType: "USER_SESSION",
        entityId: "session_1",
        timestamp: Date.UTC(2026, 7, 25, 9, 0),
      },
    ] as unknown as ReturnType<typeof useQuery>);

    render(<AuditTrailPage />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(screen.getByText("Anthony Basker")).toBeInTheDocument();
  });
});
