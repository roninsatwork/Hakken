import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { IdentitySettingsSection } from "./IdentitySettingsSection";
import type { SystemSettingsFormData } from "./types";

vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

const t = (key: string) => {
  const labels: Record<string, string> = {
    "appearance.title": "Appearance",
    "appearance.typography": "Typography",
    "appearance.typographySub": "Fonts and scale",
    "appearance.headingFont": "Heading font",
    "appearance.bodyFont": "Body font",
    "appearance.headingSize": "Heading size",
    "appearance.subTextSize": "Sub text size",
    "appearance.fonts.inter": "Inter",
    "appearance.fonts.jetbrains": "JetBrains",
    "appearance.fonts.playfair": "Playfair",
    "appearance.fonts.outfit": "Outfit",
    "appearance.sizes.tighter": "Tighter",
    "appearance.sizes.standard": "Standard",
    "appearance.sizes.punchy": "Punchy",
    "appearance.sizes.editorial": "Editorial",
    "appearance.sizes.micro": "Micro",
    "appearance.sizes.readable": "Readable",
    "appearance.darkMatrix": "Dark matrix",
    "appearance.darkMatrixSub": "Dark palette",
    "appearance.lightMatrix": "Light matrix",
    "appearance.lightMatrixSub": "Light palette",
    "appearance.coreEnv": "Core",
    "appearance.semanticOps": "Semantic",
    "appearance.bgBase": "Background",
    "appearance.cardSurfaces": "Cards",
    "appearance.primaryText": "Primary",
    "appearance.secondaryText": "Secondary",
    "appearance.hoverBlocks": "Hover",
    "appearance.borders": "Borders",
    "appearance.success": "Success",
    "appearance.destructive": "Destructive",
    "appearance.focusRing": "Focus",
    "appearance.brandOrigin": "Brand origin",
    "appearance.brandOriginSub": "Brand color",
    "appearance.brandColor": "Brand",
    "identity.title": "Identity",
    "identity.platformName": "Platform name",
    "identity.platformNameSub": "Public display name",
    "identity.placeholder": "Enter platform name",
    "identity.logoLight": "Light logo",
    "identity.logoLightSub": "Shown on light surfaces",
    "identity.logoDark": "Dark logo",
    "identity.logoDarkSub": "Shown on dark surfaces",
  };
  return labels[key] ?? key;
};

describe("settings sections", () => {
  it("edits identity text and uploads light and dark logos", () => {
    const setFormData = vi.fn();
    const onFileUpload = vi.fn();
    const formData: SystemSettingsFormData = {
      platformName: "Sonae",
      logoUrlLight: "/light.png",
      logoUrlDark: "/dark.png",
    };

    const { container } = render(
      <IdentitySettingsSection
        formData={formData}
        setFormData={setFormData}
        uploadingLight
        uploadingDark={false}
        onFileUpload={onFileUpload}
        t={t}
      />
    );

    fireEvent.change(screen.getByDisplayValue("Sonae"), { target: { value: "New Sonae" } });

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["light"], "light.png")] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["dark"], "dark.png")] } });

    expect(screen.getByAltText("Light mode")).toBeInTheDocument();
    expect(screen.getByAltText("Dark mode")).toBeInTheDocument();
    expect(setFormData).toHaveBeenCalledWith({ ...formData, platformName: "New Sonae" });
    expect(onFileUpload).toHaveBeenCalledWith(expect.any(Object), "light");
    expect(onFileUpload).toHaveBeenCalledWith(expect.any(Object), "dark");
  });

  it("edits appearance typography and palette fields", () => {
    const setFormData = vi.fn();
    const formData: SystemSettingsFormData = {
      headingFontFamily: "var(--font-sans)",
      bodyFontFamily: "var(--font-sans)",
      headingSizeGlobal: "1.5rem",
      subTextSizeGlobal: "13px",
      darkBg: "#000000",
      lightBg: "#ffffff",
      brandColorHex: "#aa5500",
    };

    render(<AppearanceSettingsSection formData={formData} setFormData={setFormData} t={t} />);

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "var(--font-mono)" },
    });
    fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "2.25rem" } });
    fireEvent.change(screen.getAllByDisplayValue("#000000")[0], { target: { value: "#111111" } });
    fireEvent.change(screen.getByDisplayValue("#ffffff"), { target: { value: "#eeeeee" } });
    fireEvent.change(screen.getByDisplayValue("#aa5500"), { target: { value: "#ff6600" } });

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(setFormData).toHaveBeenCalledWith({ ...formData, headingFontFamily: "var(--font-mono)" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, headingSizeGlobal: "2.25rem" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, darkBg: "#111111" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, lightBg: "#EEEEEE" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, brandColorHex: "#FF6600" });
  });
});
