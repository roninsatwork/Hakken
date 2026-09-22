"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Play } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { ModalFormField } from "@/src/ui/components/screens/ModalForm";
import { Select } from "@/src/ui/components/screens/Select";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/**
 * Start a collection without waiting for a schedule.
 *
 * Until this existed the only thing that could open a cycle was the agent on a
 * scheduled run, so testing a change meant waiting for a schedule and support
 * had nothing to offer a client asking for fresh numbers today.
 *
 * It sits on the platform's collection screen rather than in a company
 * workspace because pressing it spends Hakken's own money, and that workspace
 * becomes customer-facing. The company is chosen here instead.
 *
 * The confirmation is not ceremony. A cycle plans one paid request per website
 * per operation the moment it opens, so this is the last point at which
 * nothing has been bought.
 */
export function CollectNow() {
  const t = useTranslations("admin.seoCollection.collectNow");
  const tCommon = useTranslations("common");

  const [isOpen, setIsOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [alreadyRunning, setAlreadyRunning] = useState(false);

  const companies = useQuery(api.companies.getCompanyOptions, {});
  const startCollection = useMutation(api.seoCollectionStart.startCollectionNow);
  // The house runner, so a failure is unwrapped for the reader, reported to us,
  // and a double click cannot start two cycles.
  const action = useAdminAction({ scope: "seoCollectionStart" });

  const close = () => {
    setIsOpen(false);
    setAlreadyRunning(false);
    action.clearError();
    setCompanyId("");
  };

  const start = async () => {
    if (!companyId) return;
    setAlreadyRunning(false);

    const outcome = await action.run(
      async () => await startCollection({ companyId: companyId as Id<"companies"> }),
      { successMessage: t("started"), suppressErrorToast: true, fallbackMessage: t("failed") },
    );

    if (!outcome.ok) return;
    // A run already under way is not a failure of this press. It is the
    // one-cycle-per-company rule doing its job, which is why the server says
    // so in its answer rather than throwing.
    if (!outcome.data.ok) {
      setAlreadyRunning(true);
      return;
    }
    close();
  };

  return (
    <>
      <Button variant="primary" onClick={() => setIsOpen(true)}>
        <Play className="h-3.5 w-3.5" />
        {t("button")}
      </Button>

      <ConfirmationModal
        isOpen={isOpen}
        onClose={close}
        title={t("title")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={action.isBusy() ? t("starting") : t("confirm")}
        isSubmitting={action.isBusy()}
        onConfirm={() => void start()}
        error={alreadyRunning ? t("alreadyRunning") : action.error}
        warning={{ description: t("warning") }}
      >
        <ModalFormField label={t("companyLabel")} htmlFor="collect-now-company">
          <Select
            id="collect-now-company"
            value={companyId}
            onChange={(value) => setCompanyId(value)}
            disabled={companies === undefined}
          >
            <option value="">{t("companyPlaceholder")}</option>
            {(companies ?? []).map((company) => (
              <option key={company._id} value={company._id}>{company.name}</option>
            ))}
          </Select>
        </ModalFormField>
      </ConfirmationModal>
    </>
  );
}
