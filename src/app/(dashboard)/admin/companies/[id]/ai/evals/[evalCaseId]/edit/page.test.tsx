import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

import EditCompanyEvalPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/evals/EditEvalScreen", () => ({
  EditEvalScreen: ({
    companyId,
    evalCaseId,
  }: {
    companyId: Id<"companies">;
    evalCaseId: Id<"companyEvalCases">;
  }) => (
    <div data-testid="edit-eval-screen">
      {companyId}:{evalCaseId}
    </div>
  ),
}));

describe("EditCompanyEvalPage", () => {
  it("forwards both route ids to the unchanged client editor", async () => {
    const companyId = "company_1" as Id<"companies">;
    const evalCaseId = "eval_1" as Id<"companyEvalCases">;

    render(
      await EditCompanyEvalPage({
        params: Promise.resolve({ id: companyId, evalCaseId }),
      })
    );

    expect(screen.getByTestId("edit-eval-screen")).toHaveTextContent(`${companyId}:${evalCaseId}`);
  });
});
