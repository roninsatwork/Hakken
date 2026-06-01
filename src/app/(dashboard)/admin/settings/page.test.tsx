import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import SystemSettingsPage from "./page";

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

const replaceMock = vi.hoisted(() => vi.fn());
const searchTabMock = vi.hoisted(() => vi.fn(() => null as string | null));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: searchTabMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      "appearance.title": "Appearance",
      "audit.title": "Audit Trail",
      "identity.title": "Identity",
      save: "Save",
      saving: "Saving...",
      "security.maskEmails": "Mask emails",
      "security.maskPhones": "Mask phones",
      "security.masterToggle": "Enable PII",
      "security.masterToggleSub": "Protect sensitive data",
      "security.purgeEngine": "Audit purge",
      "security.purgeSub": "Audit retention",
      "security.purgeToggle": "Enable audit purge",
      "security.purgeToggleSub": "Schedule cleanup",
      "security.redaction": "Redaction",
      "security.redactionSub": "Mask PII",
      "security.title": "Security",
      subtitle: "System controls",
      success: "Saved",
      "tabs.appearance": "Appearance",
      "tabs.audit": "Audit",
      "tabs.identity": "Identity",
      "tabs.options": "Options",
      "tabs.purges": "Purges",
      "tabs.security": "Security",
      title: "Settings",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("./_components/IdentitySettingsSection", () => ({
  IdentitySettingsSection: ({ formData, setFormData }: { formData: { platformName?: string }; setFormData: (value: Record<string, string>) => void }) => (
    <label>
      Platform name
      <input value={formData.platformName ?? ""} onChange={(event) => setFormData({ ...formData, platformName: event.target.value })} />
    </label>
  ),
}));

vi.mock("./_components/AppearanceSettingsSection", () => ({
  AppearanceSettingsSection: () => <section>Appearance panel</section>,
}));

vi.mock("./_components/PurgesSettingsSection", () => ({
  PurgesSettingsSection: () => <section>Purges panel</section>,
}));

vi.mock("./_components/AuditLogsTable", () => ({
  AuditLogsSection: ({ logs }: { logs: unknown[] }) => <section>Audit rows {logs.length}</section>,
}));

const settings = {
  _id: "settings_1",
  _creationTime: 1,
  platformName: "Sonae",
  logoUrlLight: "",
  logoUrlDark: "",
};
const piiConfig = { enabled: false, maskEmails: false };
const auditConfig = { enabled: false, retentionDays: 30, dayOfMonth: 1, hourOfDay: 2 };
const recentLogs = [{ _id: "log_1" }];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("SystemSettingsPage", () => {
  const updateSettings = vi.fn();
  const generateUploadUrl = vi.fn();
  const updatePiiConfig = vi.fn();
  const updateAuditConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    searchTabMock.mockReturnValue(null);
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("settings:get")) return settings;
      if (path.includes("getPiiConfig")) return piiConfig;
      if (path.includes("getConfig")) return auditConfig;
      if (path.includes("getRecentLogs")) return recentLogs;
      return settings;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("settings:update")) return updateSettings as unknown as ReturnType<typeof useMutation>;
      if (path.includes("generateUploadUrl")) return generateUploadUrl as unknown as ReturnType<typeof useMutation>;
      if (path.includes("updatePiiConfig")) return updatePiiConfig as unknown as ReturnType<typeof useMutation>;
      return updateAuditConfig as unknown as ReturnType<typeof useMutation>;
    });
    updateSettings.mockResolvedValue(undefined);
    updatePiiConfig.mockResolvedValue(undefined);
    updateAuditConfig.mockResolvedValue(undefined);
  });

  it("renders loading then saves identity settings", async () => {
    (useQuery as unknown as HookMock).mockReturnValue(undefined);
    const { container, rerender } = render(<SystemSettingsPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("settings:get")) return settings;
      if (path.includes("getPiiConfig")) return piiConfig;
      if (path.includes("getConfig")) return auditConfig;
      if (path.includes("getRecentLogs")) return recentLogs;
      return settings;
    });
    rerender(<SystemSettingsPage />);
    fireEvent.change(screen.getByLabelText("Platform name"), { target: { value: "Sonae Pro" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ platformName: "Sonae Pro" }));
    });
  });

  it("routes tabs and saves security settings through the correct mutations", async () => {
    render(<SystemSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Security/i }));
    expect(replaceMock).toHaveBeenCalledWith("/admin/settings?tab=security", { scroll: false });
    fireEvent.click(screen.getByText("Enable PII").closest("div")?.parentElement?.querySelector("button") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updatePiiConfig).toHaveBeenCalledWith({ configStr: expect.stringContaining('"enabled":true') });
      expect(updateAuditConfig).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Audit/i }));
    expect(screen.getByText("Audit rows 1")).toBeInTheDocument();
  });
});
