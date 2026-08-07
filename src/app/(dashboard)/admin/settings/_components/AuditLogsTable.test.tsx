import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogsSection } from "./AuditLogsTable";
import type { AuditLogRow } from "./types";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const labels: Record<string, string> = {
      "admin.auditLogs.columns.action": "Action",
      "admin.auditLogs.columns.admin": "Admin",
      "admin.auditLogs.columns.target": "Target",
      "admin.auditLogs.columns.timestamp": "Timestamp",
      "admin.auditLogs.empty": "No audit logs yet",
      "admin.auditLogs.feedSub": "Recent platform changes",
      "admin.auditLogs.feedTitle": "Audit feed",
      "admin.auditLogs.noMatch": "No logs match your search",
      "admin.auditLogs.searchPlaceholder": "Search logs",
      "admin.settings.audit.title": "Audit Trail",
      "common.pagination.entries": "entries",
      "common.pagination.next": "Next",
      "common.pagination.of": "of",
      "common.pagination.previous": "Previous",
      "common.pagination.showing": "Showing",
      "common.pagination.to": "to",
    };

    return labels[`${namespace}.${key}`] ?? `${namespace}.${key}`;
  },
}));

const logs: AuditLogRow[] = [
  {
    _id: "log_1",
    actionType: "UPDATE_COMPANY",
    actorName: "Anthony",
    entityId: "company_1",
    timestamp: Date.UTC(2026, 5, 1, 10, 30),
  },
  {
    _id: "log_2",
    actionType: "CREATE_INVITE",
    actorName: "Morgan",
    entityId: "invite_1",
    timestamp: Date.UTC(2026, 5, 1, 11, 30),
  },
];

describe("AuditLogsSection", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("renders the loading state while audit logs are undefined", () => {
    const { container } = render(<AuditLogsSection logs={undefined} />);

    expect(screen.getByText("Audit Trail")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows nothing when nothing has been recorded", () => {
    /*
      This used to invent four entries to fill the space — among them a user
      deletion for a "TOS Violation" against an account that never existed,
      attributed to a named administrator. On the one screen whose entire value
      is that it contains only things that happened, placeholder rows are not a
      cosmetic problem.
    */
    render(<AuditLogsSection logs={[]} />);

    expect(screen.queryByText("UPDATE_COMPANY")).not.toBeInTheDocument();
    expect(screen.queryByText("TOGGLE_PII")).not.toBeInTheDocument();
    expect(screen.queryByText(/usr_malicious_99/)).not.toBeInTheDocument();
  });

  it("filters rows by action or actor and navigates to log detail pages", () => {
    render(<AuditLogsSection logs={logs} />);

    fireEvent.click(screen.getByText("UPDATE_COMPANY"));

    expect(pushMock).toHaveBeenCalledWith("/admin/audit-logs/log_1");

    fireEvent.change(screen.getByPlaceholderText("Search logs"), { target: { value: "Morgan" } });

    expect(screen.queryByText("UPDATE_COMPANY")).not.toBeInTheDocument();
    expect(screen.getByText("CREATE_INVITE")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search logs"), { target: { value: "missing" } });

    expect(screen.getByText("No logs match your search")).toBeInTheDocument();
  });
});
