import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LegacySalesDataImportPage from "./page";

vi.mock("../LegacySalesDataRedirect", () => ({
  LegacySalesDataRedirect: ({ to }: { to: "spreadsheet-import" | "import-data" }) => (
    <div data-testid="legacy-sales-data-redirect">{to}</div>
  ),
}));

describe("LegacySalesDataImportPage", () => {
  it("keeps forwarding the legacy import route to workspace import data", () => {
    render(<LegacySalesDataImportPage />);

    expect(screen.getByTestId("legacy-sales-data-redirect")).toHaveTextContent("import-data");
  });
});
