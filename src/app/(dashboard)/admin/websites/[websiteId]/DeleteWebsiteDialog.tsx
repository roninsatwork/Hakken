"use client";

import { useTranslations } from "next-intl";

import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";

export type AffectedWatcher = {
  companyName: string;
  /** What the company loses: their own site, or a rival of one of their sites. */
  detail: string;
};

type DeleteWebsiteDialogProps = {
  host: string | null;
  affected: AffectedWatcher[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  error: string;
};

/**
 * Deleting a shared record, with its consequences named first.
 *
 * This is the sharp edge of one website serving everyone: a single delete can
 * strip a competitor out of three clients' divisions at once, and from this
 * screen there is no way to see that unless it is said. So every company and
 * division about to lose the website is listed before the button, and the same
 * list goes into the audit entry.
 *
 * A super admin may still go ahead. What they may not do is find out afterwards.
 */
export function DeleteWebsiteDialog({
  host,
  affected,
  onClose,
  onConfirm,
  isSubmitting,
  error,
}: DeleteWebsiteDialogProps) {
  const t = useTranslations("admin.websiteDetail");
  const tCommon = useTranslations("common");

  return (
    <ConfirmationModal
      isOpen={host !== null}
      onClose={onClose}
      title={t("deleteTitle")}
      cancelLabel={tCommon("cancel")}
      confirmLabel={isSubmitting ? tCommon("deleting") : t("deleteWebsite")}
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
      error={error}
      warning={{ title: t("deleteWarningTitle"), description: t("deleteWarningBody") }}
    >
      <div className="flex flex-col gap-3">
        <p>
          {t.rich("deleteConfirm", {
            host: host ?? "",
            highlight: (chunks) => (
              <strong className="font-semibold text-foreground">{chunks}</strong>
            ),
          })}
        </p>

        {affected.length === 0 ? (
          <p className="text-[13px] text-muted">{t("affectedNone")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-secondary">
              {t("affectedTitle", { count: affected.length })}
            </p>
            <ul className="flex flex-col gap-1 rounded-[10px] border border-border-dim bg-background/60 px-3 py-2">
              {affected.map((watcher) => (
                <li
                  key={`${watcher.companyName}-${watcher.detail}`}
                  className="text-[12px] text-foreground"
                >
                  <span className="text-secondary">{watcher.companyName}</span>
                  {" — "}
                  {watcher.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
