"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { FileQuestion, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";

/**
 * The page every Admin → Content editor is (docs/plans/active/knowledge-news-
 * and-digest-plan.md; Anthony, 2026-10-01: an editor is a page, never a
 * pop-up): the way back to its list, the fields, the reason a save failed,
 * and Save — which returns to the list (`useContentForm`). While the row
 * loads it says so; if it has gone, it says that instead of an empty form.
 */
export function ContentEditPage({
  state,
  back,
  icon,
  title,
  description,
  pills,
  headerAction,
  notice,
  error,
  isSaving,
  saveLabel,
  saveDisabled = false,
  onSubmit,
  children,
}: {
  state: "loading" | "missing" | "ready";
  back: { label: string; href: string };
  icon: ReactNode;
  title: string;
  description: string;
  /**
   * A saved record's status labels under its description, and its own
   * controls on the header's right — the Library's article page
   * (content-library-plan.md): who reads it, Read again, Open the original,
   * Delete. `DetailHeader` already draws both; an editor without them is
   * unchanged.
   */
  pills?: ReactNode;
  headerAction?: ReactNode;
  /** A notice under the header, above the fields: what leads the News front page (insights-helpful-content-plan.md, IH11). */
  notice?: ReactNode;
  error: string;
  isSaving: boolean;
  saveLabel: string;
  /** Nothing to save yet: the Library's Add page before its page is read. */
  saveDisabled?: boolean;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  children: ReactNode;
}) {
  const t = useTranslations("admin.contentEditor");
  const tCommon = useTranslations("common");

  if (state === "loading") return <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;

  return (
    <div className="flex w-full flex-col gap-5 pb-8">
      <DetailHeader
        back={back}
        icon={icon}
        title={state === "missing" ? t("missingTitle") : title}
        description={state === "missing" ? undefined : description}
        pills={state === "missing" ? undefined : pills}
        action={state === "missing" ? undefined : headerAction}
      />
      {state === "missing" ? null : notice}
      {state === "missing" ? (
        <HakkenEmptyState icon={FileQuestion} title={t("missingTitle")} description={t("missingDescription")} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {children}
          <SaveError>{error}</SaveError>
          <div className="flex items-center justify-end gap-4 border-t border-border-dim pt-5">
            <Link href={back.href} className="rounded-[10px] px-4 py-2.5 text-sm text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground">
              {tCommon("cancel")}
            </Link>
            <SaveAction type="submit" isSaving={isSaving} disabled={saveDisabled} label={saveLabel} savingLabel={tCommon("saving")} />
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * How far the Translator has got with the English as it stands (revised
 * 2026-10-01): every language done, some still on their way, or none to do —
 * an article is translated once it is published.
 */
export function TranslationStatus({ progress, compact = false }: { progress: { done: number; total: number }; compact?: boolean }) {
  const t = useTranslations("admin.contentEditor.translations");
  const words =
    progress.total === 0 ? t("notYet") : progress.done >= progress.total ? t("done") : t("waiting", { done: progress.done, total: progress.total });
  if (compact) return <span className="text-[12px] text-secondary">{words}</span>;
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-secondary">
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      {words}
    </p>
  );
}
