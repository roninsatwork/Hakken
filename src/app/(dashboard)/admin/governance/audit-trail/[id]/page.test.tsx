import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuditEntryPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

const params = Object.assign(Promise.resolve({ id: "audit_1" }), {
  status: "fulfilled",
  value: { id: "audit_1" },
});

describe("AuditEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the existing spinner while the scoped record query is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<AuditEntryPage params={params} />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
