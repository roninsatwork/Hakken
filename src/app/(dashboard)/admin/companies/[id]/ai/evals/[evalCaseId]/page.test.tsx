import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { routeParams } from "@/src/test/routeParams";
import CompanyEvalCaseDetailPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/evals/EvalCaseDetailScreen", () => ({
  EvalCaseDetailScreen: ({
    companyId,
    evalCaseId,
  }: {
    companyId?: Id<"companies">;
    evalCaseId: Id<"companyEvalCases">;
  }) => (
    <div
      data-testid="eval-case-detail"
      data-company-id={companyId}
      data-eval-case-id={evalCaseId}
    />
  ),
}));

describe("CompanyEvalCaseDetailPage", () => {
  it("passes both route parameters unchanged to the client detail screen", async () => {
    const companyId = "company_1234567890" as Id<"companies">;
    const evalCaseId = "eval_case_1234567890" as Id<"companyEvalCases">;

    render(
      await CompanyEvalCaseDetailPage({
        params: routeParams({ id: companyId, evalCaseId }),
      }),
    );

    expect(screen.getByTestId("eval-case-detail")).toHaveAttribute(
      "data-company-id",
      companyId,
    );
    expect(screen.getByTestId("eval-case-detail")).toHaveAttribute(
      "data-eval-case-id",
      evalCaseId,
    );
  });
});
