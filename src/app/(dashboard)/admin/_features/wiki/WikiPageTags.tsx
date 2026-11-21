"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";

/**
 * A page's tags, in the page's side column (Sonae `b4b13509` and `bca5240f`; wiki-sonae-catch-up-plan-2026-11-21.md,
 * S5). The nightly check-up adds and tidies tags by itself, and a person can add their own and take any off. Pointing
 * at a tag says who added it; the check-up never takes off a tag a person added (`wikiCheckupPages.setMachineTagsInternal`).
 *
 * `editable` is false for a Knowledge article's page, which is changed only under Content, and the server refuses its
 * tags anyway (`requireScopedPage`).
 */
export function WikiPageTags({
  companyId,
  pageId,
  tags,
  editable,
}: {
  companyId?: Id<"companies">;
  pageId: Id<"wikiPages">;
  tags: Array<{ tag: string; byHuman: boolean }>;
  editable: boolean;
}) {
  const t = useTranslations("aiPages.detail.tags");
  const canWrite = useCanWriteHere() && editable;
  const action = useAdminAction({ scope: "admin-wiki-tags" });
  const addCompany = useMutation(api.wikiCheckupPages.addTagForCompany);
  const addGlobal = useMutation(api.wikiCheckupPages.addTagForGlobal);
  const removeCompany = useMutation(api.wikiCheckupPages.removeTagForCompany);
  const removeGlobal = useMutation(api.wikiCheckupPages.removeTagForGlobal);
  const [draft, setDraft] = useState("");

  const add = () => {
    const tag = draft.trim();
    if (!tag || action.isBusy("wiki-tag-add")) return;
    void action
      .run(() => (companyId ? addCompany({ companyId, pageId, tag }) : addGlobal({ pageId, tag })), {
        key: "wiki-tag-add",
        fallbackMessage: t("failed"),
      })
      .then((outcome) => {
        if (outcome.ok) setDraft("");
      });
  };

  const remove = (tag: string) =>
    void action.run(() => (companyId ? removeCompany({ companyId, pageId, tag }) : removeGlobal({ pageId, tag })), {
      key: `wiki-tag-remove-${tag}`,
      fallbackMessage: t("failed"),
    });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {tags.length === 0 ? (
        <p className="text-[13px] text-secondary">{t("none")}</p>
      ) : (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {tags.map((entry) => (
            <li key={entry.tag} className="flex min-w-0 items-center gap-0.5">
              {/* A tag is a kind, so it's the kit's TagLabel. The check-up keeps one to 32 letters, which fits the column. */}
              <span title={entry.byHuman ? t("byHuman") : t("byMachine")} className="min-w-0">
                <TagLabel>{entry.tag}</TagLabel>
              </span>
              {canWrite ? (
                <Button
                  variant="icon"
                  onClick={() => remove(entry.tag)}
                  disabled={action.isBusy(`wiki-tag-remove-${entry.tag}`)}
                  aria-label={t("remove", { tag: entry.tag })}
                  title={t("remove", { tag: entry.tag })}
                  className="p-1"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field
              label={t("addLabel")}
              labelHidden
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") add();
              }}
              placeholder={t("placeholder")}
            />
          </div>
          <Button variant="outline" onClick={add} disabled={!draft.trim() || action.isBusy("wiki-tag-add")} className="whitespace-nowrap disabled:opacity-50">
            {t("add")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
