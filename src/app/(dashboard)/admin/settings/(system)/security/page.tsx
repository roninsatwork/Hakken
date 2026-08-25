"use client";

import dynamic from "next/dynamic";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { SettingsScreen } from "../../_components/SettingsScreen";

const SystemSecurityContent = dynamic(() =>
  import("./SystemSecurityContent").then((module) => module.SystemSecurityContent),
  { loading: () => <SettingsScreen isLoading>{null}</SettingsScreen> },
);

export default function SystemSecurityPage() {
  const currentPiiConfig = useQuery(api.system.getPiiConfig);

  if (currentPiiConfig === undefined) {
    return <SettingsScreen isLoading>{null}</SettingsScreen>;
  }

  return <SystemSecurityContent currentPiiConfig={currentPiiConfig} />;
}
