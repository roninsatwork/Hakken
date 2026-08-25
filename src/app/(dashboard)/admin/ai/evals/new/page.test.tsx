import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/app/(dashboard)/admin/_features/evals/NewEvalScreen", () => ({
  NewEvalScreen: ({ companyId }: { companyId?: string }) => (
    <div data-testid="scope">{companyId ?? "global"}</div>
  ),
}));

import NewGlobalEvalPage from "./page";

describe("NewGlobalEvalPage", () => {
  it("keeps the global eval form unscoped", () => {
    render(<NewGlobalEvalPage />);

    expect(screen.getByTestId("scope")).toHaveTextContent("global");
  });
});
