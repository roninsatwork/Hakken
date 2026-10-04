"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import Header from "@/src/ui/components/layout/Header";
import { BackRow } from "@/src/ui/components/screens/PageHeader";
import { ListForm } from "../../../_components/ListForm";
import { KEYWORD_RESEARCH_HREF, listHref } from "../../../_components/useLookup";

/**
 * Rename a research list: the list's pencil, on Research lists and on the
 * list's own header, opens this page rather than a pop-up — a name is a
 * field (Anthony, 2026-10-01). Save returns to the list.
 */
export default function RenameResearchListPage() {
  const t = useTranslations("keywordResearch.listForm");
  const tl = useTranslations("keywordResearch.list");
  const router = useRouter();
  const params = useParams<{ listId: string }>();
  const listId = params.listId as Id<"researchLists">;
  const list = useQuery(api.keywordResearch.researchList, { listId });
  const rename = useMutation(api.keywordResearch.renameResearchList);
  const { run, isBusy, error } = useAdminAction({ scope: "keyword-research-rename-list" });

  if (list === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }
  if (list === null) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-6 pb-8">
          <BackRow label={tl("back")} href={KEYWORD_RESEARCH_HREF} />
          <HakkenEmptyState icon={ListChecks} title={tl("notFoundTitle")} description={tl("notFoundBody")} />
        </div>
      </>
    );
  }

  return (
    <ListForm
      back={{ label: list.name, href: listHref(list.listId) }}
      title={t("renameTitle")}
      description={t("renameDescription")}
      initialName={list.name}
      canChange={list.canChange}
      isSaving={isBusy()}
      error={error}
      onSave={async (name) => {
        const outcome = await run(() => rename({ listId, name }), { fallbackMessage: t("failed"), suppressErrorToast: true });
        if (outcome.ok) router.push(listHref(list.listId));
      }}
    />
  );
}
