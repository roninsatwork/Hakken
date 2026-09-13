"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Gamepad2 } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useGameViewport } from "./useGameViewport";

const FirstPersonCanvas = dynamic(() => import("./FirstPersonCanvas"), {
  ssr: false,
});

export default function Ronin3DPage() {
  useGameViewport();
  const t = useTranslations("arcade.firstPerson");
  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="mt-2 flex flex-col gap-6 pb-8">
        <PageHeader
          divider
          icon={<Gamepad2 className="h-6 w-6 text-brand" />}
          title={t("title")}
          description={t("description")}
        />
        <FirstPersonCanvas />
      </div>
    </div>
  );
}
