import { renderWithProviders as render, screen, fireEvent } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrainCircuit } from "lucide-react";
import { AdminRulesTable, type AdminRuleTableRow } from "./AdminRulesTable";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const baseRule = {
  _id: "rule_1",
  priority: "HIGH",
  name: "Escalate support risk",
  trigger: "risk",
  isActive: true,
} as AdminRuleTableRow;

function renderTable(overrides: Partial<Parameters<typeof AdminRulesTable>[0]> = {}) {
  const props = {
    rules: [baseRule],
    isLoading: false,
    emptyIcon: <BrainCircuit data-testid="empty-icon" />,
    emptyLabel: "No rules",
    page: 1,
    totalPages: 1,
    totalCount: 1,
    pageSize: 15,
    onPageChange: vi.fn(),
    getRowHref: (rule: AdminRuleTableRow) => `/admin/ai/rules/${rule._id}`,
    getEditHref: (rule: AdminRuleTableRow) => `/admin/ai/rules/${rule._id}`,
    onToggleActive: vi.fn(),
    onDelete: vi.fn(),
    labels: {
      priority: "Priority",
      rule: "Rule",
      status: "Status",
      activate: "Activate",
      deactivate: "Deactivate",
      edit: "Edit",
      delete: "Delete",
    },
    ...overrides,
  };

  return { ...render(<AdminRulesTable {...props} />), props };
}

describe("AdminRulesTable", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("renders shared rule rows and navigates on row click", () => {
    renderTable();

    fireEvent.click(screen.getByText("Escalate support risk"));

    expect(push).toHaveBeenCalledWith("/admin/ai/rules/rule_1");
  });

  it("uses shared action callbacks without navigating", () => {
    const onToggleActive = vi.fn();
    const onDelete = vi.fn();
    renderTable({ onToggleActive, onDelete });

    fireEvent.click(screen.getByTitle("Deactivate"));
    fireEvent.click(screen.getByTitle("Delete"));

    expect(onToggleActive).toHaveBeenCalledWith(baseRule);
    expect(onDelete).toHaveBeenCalledWith(baseRule);
    expect(push).not.toHaveBeenCalled();
  });

  it("renders the shared empty row", () => {
    renderTable({ rules: [], totalCount: 0 });

    expect(screen.getByText("No rules")).toBeInTheDocument();
  });
});
