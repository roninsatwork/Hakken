"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";

/**
 * New goal (personal-layer-and-goals-plan.md, part 1): goals are the one page
 * kind people write from scratch; the Distiller never does. It was a pop-up
 * with fields over the wiki's list, which broke the rule that a pop-up is only
 * for a yes or a no (AGENTS.md); now it is a page of its own, opened from the
 * list (wiki-sonae-catch-up-plan-2026-11-21.md, S6, from the upstream
 * framework's `be63693c`). Adding the goal, its one orange action, takes you
 * back to the wiki's pages.
 *
 * A page about one record, so it wears `DetailHeader` with its way back, and
 * the AI section shows it without its menu (`aiMenu.ts`).
 */
export function WikiNewGoalScreen({ companyId, basePath }: { companyId?: Id<"companies">; basePath: string }) {
  const t = useTranslations("aiPages");
  const router = useRouter();
  const action = useAdminAction({ scope: "admin-wiki-goal" });
  const createGoalCompany = useMutation(api.wikiPages.createGoalPageForCompany);
  const createGoalGlobal = useMutation(api.wikiPages.createGoalPageForGlobal);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const isSaving = action.isBusy("goal");

  const save = async () => {
    if (!title.trim() || !content.trim()) return;
    setError("");
    const outcome = await action.run(
      () => (companyId ? createGoalCompany({ companyId, title, content }) : createGoalGlobal({ title, content })),
      { key: "goal", suppressErrorToast: true, fallbackMessage: t("goal.failed") },
    );
    if (outcome.ok) {
      router.push(basePath);
      return;
    }
    if (outcome.message) setError(outcome.message);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("goal.back"), href: basePath }}
        icon={<Target className="h-6 w-6 text-brand" />}
        title={t("goal.title")}
        description={t("goal.hint")}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field
          label={t("goal.nameLabel")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("goal.namePlaceholder")}
          disabled={isSaving}
        />
        <TextAreaField
          label={t("goal.aimLabel")}
          wrapperClassName="lg:col-span-2"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={t("goal.bodyPlaceholder")}
          rows={5}
          disabled={isSaving}
          className="min-h-[140px] resize-y"
        />
      </div>
      <SaveError>{error}</SaveError>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-dim pt-4">
        <PagePrimaryAction variant="brand" onClick={() => void save()} disabled={isSaving || !title.trim() || !content.trim()}>
          {isSaving ? t("goal.saving") : t("goal.action")}
        </PagePrimaryAction>
        <Button variant="ghost" onClick={() => router.push(basePath)} disabled={isSaving}>
          {t("delete.cancel")}
        </Button>
      </div>
    </div>
  );
}
