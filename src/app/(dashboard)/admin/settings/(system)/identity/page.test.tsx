import { screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoreIdentityPage from "./page";

const useSystemSettingsFormMock = vi.hoisted(() => vi.fn());

vi.mock("../../_components/useSystemSettingsForm", () => ({
  IDENTITY_SETTINGS_FIELDS: ["platformName", "emailSenderName", "emailSenderAddress"],
  useSystemSettingsForm: useSystemSettingsFormMock,
}));

vi.mock("./IdentitySettingsContent", () => ({
  IdentitySettingsContent: () => <div>Loaded identity settings</div>,
}));

const loadedSettings = {
  formData: {},
  setFormData: vi.fn(),
  isLoading: false,
  isSaving: false,
  saveSuccess: false,
  save: vi.fn(),
  updateSettings: vi.fn(),
};

describe("CoreIdentityPage", () => {
  beforeEach(() => {
    useSystemSettingsFormMock.mockReset();
  });

  it("keeps the existing loading screen immediate while settings resolve", () => {
    useSystemSettingsFormMock.mockReturnValue({ ...loadedSettings, isLoading: true });

    const { container } = render(<CoreIdentityPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Loaded identity settings")).not.toBeInTheDocument();
    expect(useSystemSettingsFormMock).toHaveBeenCalledWith([
      "platformName",
      "emailSenderName",
      "emailSenderAddress",
    ]);
  });

  it("renders the answered identity form after its module is ready", async () => {
    useSystemSettingsFormMock.mockReturnValue(loadedSettings);

    const { container } = render(<CoreIdentityPage />);

    expect(await screen.findByText("Loaded identity settings")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
