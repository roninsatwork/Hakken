"use client";

import { useMutation, useQuery } from "convex/react";
import { BotMessageSquare, ListTodo } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { HakkenTasksScreen } from "@/src/app/(dashboard)/_features/hakken-tasks/HakkenTasksScreen";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import Header from "@/src/ui/components/layout/Header";
import { PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";

/**
 * Hakken tasks, in the menu after Ask Hakken (docs/plans/active/
 * hakken-tasks-plan.md, item 1.5; board MyTasks): everything Hakken keeps an
 * eye on for the person reading, and only theirs. A task is added by asking
 * Hakken, so "Add a task" opens Ask Hakken.
 */
export default function HakkenTasksPage() {
  const t = useTranslations("hakkenTasks");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const rows = useQuery(api.hakkenTasks.listMine, {});
  const pause = useMutation(api.hakkenTasks.pauseMine);
  const resume = useMutation(api.hakkenTasks.resumeMine);
  const remove = useMutation(api.hakkenTasks.deleteMine);

  return (
    <>
      <Header />
      <HakkenTasksScreen
        divider
        icon={<ListTodo className="h-6 w-6 text-brand" />}
        description={t("description", { platformName })}
        action={
          <PagePrimaryAction icon={<BotMessageSquare className="h-4 w-4" />} onClick={() => router.push("/app/assistant")}>
            {t("addTask")}
          </PagePrimaryAction>
        }
        rows={rows}
        scope="hakken-tasks"
        pause={(taskId) => pause({ taskId })}
        resume={(taskId) => resume({ taskId })}
        remove={(taskId) => remove({ taskId })}
      />
    </>
  );
}
