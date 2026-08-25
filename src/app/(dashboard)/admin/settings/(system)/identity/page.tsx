"use client";

import { lazy, Suspense } from "react";
import { SettingsScreen } from "../../_components/SettingsScreen";
import { IDENTITY_SETTINGS_FIELDS, useSystemSettingsForm } from "../../_components/useSystemSettingsForm";

const IdentitySettingsContent = lazy(() =>
  import("./IdentitySettingsContent").then((module) => ({ default: module.IdentitySettingsContent })),
);

function IdentitySettingsLoading() {
  return <SettingsScreen isLoading>{null}</SettingsScreen>;
}

export default function CoreIdentityPage() {
  const { isLoading, ...identitySettings } = useSystemSettingsForm(IDENTITY_SETTINGS_FIELDS);

  if (isLoading) return <IdentitySettingsLoading />;

  return <Suspense fallback={<IdentitySettingsLoading />}><IdentitySettingsContent {...identitySettings} /></Suspense>;
}
