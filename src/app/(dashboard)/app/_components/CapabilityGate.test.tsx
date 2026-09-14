import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";

import { CapabilityGate } from "./CapabilityGate";
import TasksLayout from "../tasks/layout";
import CallsLayout from "../calls/layout";
import ReceptionLayout from "../reception/layout";
// template:remove:start properties
import PropertiesLayout from "../properties/layout";

// template:remove:end
// template:remove:start salesReports
import ReportsLayout from "../reports/layout";

// template:remove:end
import { DEFAULT_COMPANY_MODULE_KEYS } from "@/convex/utils/coreModules";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

/**
 * Every capability section bounces a workspace that does not hold it.
 *
 * The layouts are rendered for real, not reimplemented here, so a section
 * whose layout forgets the gate — or names the wrong module — fails this
 * file rather than shipping reachable-by-URL.
 */

const SECTIONS = [
  { name: "tasks", Layout: TasksLayout, key: "tasks" },
  { name: "calls", Layout: CallsLayout, key: "calls" },
  { name: "reception", Layout: ReceptionLayout, key: "reception" },
  // template:remove:start properties
  { name: "properties", Layout: PropertiesLayout, key: "properties" },
  // template:remove:end
  // template:remove:start salesReports
  { name: "reports", Layout: ReportsLayout, key: "reports" },
  // template:remove:end
] as const;

describe("capability section gates", () => {
  const replace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ replace } as never);
  });

  for (const { name, Layout, key } of SECTIONS) {
    it(`${name}: bounced to the dashboard when withheld, shown when held`, () => {
      vi.mocked(useQuery).mockReturnValue({ companyName: "Acme", enabledModules: [] });
      const bounced = render(<Layout><p>{name} body</p></Layout>);
      expect(screen.queryByText(`${name} body`)).not.toBeInTheDocument();
      expect(replace).toHaveBeenCalledWith("/app");
      bounced.unmount();

      replace.mockClear();
      vi.mocked(useQuery).mockReturnValue({ companyName: "Acme", enabledModules: [key] });
      render(<Layout><p>{name} body</p></Layout>);
      expect(screen.getByText(`${name} body`)).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });
  }

  it("renders nothing and bounces nobody while the answer is still out", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    render(
      <CapabilityGate moduleKey={DEFAULT_COMPANY_MODULE_KEYS[0]!}>
        <p>too early</p>
      </CapabilityGate>
    );

    expect(screen.queryByText("too early")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
