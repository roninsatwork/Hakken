import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AuditEntryContent from "./AuditEntryContent";

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

describe("AuditEntryContent", () => {
  it("keeps the privacy-safe not-found response", () => {
    render(<AuditEntryContent entry={null} />);

    expect(screen.getByText("admin.governance.auditTrail.entry.notFound")).toBeInTheDocument();
  });

  it("renders the unchanged full record", () => {
    const entry = {
      _id: "audit_1",
      _creationTime: Date.UTC(2026, 7, 25, 9, 0),
      actionType: "LOGIN",
      actorName: "Anthony Basker",
      entityType: "USER_SESSION",
      entityId: "session_1",
      targetName: "Anthony's session",
      timestamp: Date.UTC(2026, 7, 25, 9, 0),
      changes: [],
      details: [{ key: "result", value: "successful" }],
      change: "Signed in",
    } as unknown as Parameters<typeof AuditEntryContent>[0]["entry"];

    render(<AuditEntryContent entry={entry} />);

    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(screen.getByText("Anthony Basker")).toBeInTheDocument();
    expect(screen.getByText("successful")).toBeInTheDocument();
  });
});
