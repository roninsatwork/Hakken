import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LegacySalesDataPage from "./page";

vi.mock("./LegacySalesDataRedirect", () => ({
  LegacySalesDataRedirect: ({ to }: { to: "spreadsheet-import" | "import-data" }) => (
    <div data-testid="legacy-sales-data-redirect">{to}</div>
  ),
}));

describe("LegacySalesDataPage", () => {
  it("keeps forwarding the legacy root to the spreadsheet import", () => {
    render(<LegacySalesDataPage />);

    expect(screen.getByTestId("legacy-sales-data-redirect")).toHaveTextContent("spreadsheet-import");
  });
});
