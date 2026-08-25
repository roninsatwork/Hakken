import React from "react";
import { screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSystemSettingsForm } from "../../_components/useSystemSettingsForm";
import DeveloperDiagnosticsPage from "./page";

const deferred = vi.hoisted(() => ({ ready: false }));

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("../../_components/useSystemSettingsForm", () => ({
  DIAGNOSTICS_SETTINGS_FIELDS: ["diagnosticRoutingEnabled"],
  useSystemSettingsForm: vi.fn(),
}));

vi.mock("next/dynamic", async () => {
  const { DeveloperDiagnosticsContent } = await import("./DeveloperDiagnosticsContent");
  return {
    default: (
      _loader: unknown,
      options: { loading: React.ComponentType },
    ) =>
      function DeferredContent(props: React.ComponentProps<typeof DeveloperDiagnosticsContent>) {
        const Component = deferred.ready ? DeveloperDiagnosticsContent : options.loading;
        return <Component {...props} />;
      },
  };
});

describe("DeveloperDiagnosticsPage", () => {
  const setFormData = vi.fn();
  const save = vi.fn(async () => undefined);

  const formResult = (
    overrides: Partial<ReturnType<typeof useSystemSettingsForm>> = {},
  ) =>
    ({
      formData: { diagnosticRoutingEnabled: true },
      setFormData,
      isLoading: false,
      isSaving: false,
      saveSuccess: false,
      save,
      updateSettings: vi.fn(),
      ...overrides,
    }) as unknown as ReturnType<typeof useSystemSettingsForm>;

  beforeEach(() => {
    vi.clearAllMocks();
    deferred.ready = false;
    vi.mocked(useSystemSettingsForm).mockReturnValue(formResult());
  });

  it("keeps the existing spinner while settings are unresolved", () => {
    vi.mocked(useSystemSettingsForm).mockReturnValue(formResult({ isLoading: true }));

    const { container } = render(<DeveloperDiagnosticsPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps the same spinner while the populated screen chunk loads", () => {
    const { container } = render(<DeveloperDiagnosticsPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the unchanged option and value after the chunk loads", () => {
    deferred.ready = true;

    render(<DeveloperDiagnosticsPage />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("admin.settings.options.routingMatrix")).toHaveLength(2);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
