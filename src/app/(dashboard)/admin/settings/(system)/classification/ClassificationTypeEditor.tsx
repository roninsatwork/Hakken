"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { MOST_TYPE_NAME } from "@/convex/utils/classificationTypes";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { FieldHint, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { CLASSIFICATION_TYPES_ROOT } from "./classificationTypeRoutes";
import { RemoveClassificationTypeDialog } from "./RemoveClassificationTypeDialog";

/**
 * A type's own page, and Add a type (docs/plans/active/classification-types-
 * plan.md, CT3–CT4; drawn as boards 2–4, approved 2026-10-15): one field,
 * its English name. It has a field, so it is a page, never a pop-up. A built-in type is renamed but never removed; an added type is
 * removed, after a yes, only while no classification uses it.
 */
export function ClassificationTypeEditor({ typeKey }: { typeKey: string | null }) {
  const t = useTranslations("admin.classificationTypes");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const canWrite = useCanWriteHere();
  const { platformName } = useSystemSettings();
  const saved = useQuery(api.classificationTypes.classificationTypeDetail, typeKey ? { key: typeKey } : "skip");
  const saveType = useMutation(api.classificationTypes.saveClassificationType);
  const action = useAdminAction({ scope: "admin-classification-type-edit" });

  const [adopted, setAdopted] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [removing, setRemoving] = useState(false);

  // What is saved is adopted once per saved state, keyed on the values, so an
  // edit in progress survives the query refreshing.
  const savedKey = saved ? saved.nameEn : null;
  if (saved && savedKey !== adopted) {
    setAdopted(savedKey);
    setName(saved.nameEn);
  }

  const back = { label: t("back"), href: CLASSIFICATION_TYPES_ROOT };
  const icon = <Layers className="h-6 w-6 text-brand" />;
  if (typeKey !== null && saved === undefined) return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  if (typeKey !== null && saved === null) {
    return (
      <div className="flex flex-col gap-6">
        <DetailHeader back={back} icon={icon} title={t("newTitle")} />
        <Notice>{t("notFound")}</Notice>
      </div>
    );
  }

  const isNew = typeKey === null || !saved;
  const changed = isNew || name !== saved.nameEn;
  const inUse = !isNew && (saved.classifications > 0 || saved.more);
  const description = isNew
    ? t("newDescription")
    : [
      saved.addedAt !== null ? t("added", { date: formatDate(saved.addedAt, { locale: "en-GB" }) }) : null,
      saved.more
        ? t("usesMore", { count: format.number(saved.classifications), websites: format.number(saved.websites) })
        : t("uses", { count: saved.classifications, websites: saved.websites }),
    ].filter(Boolean).join(" ");

  const edited = () => {
    setJustSaved(false);
    setError("");
  };

  const save = async () => {
    setError("");
    setJustSaved(false);
    const outcome = await action.run(
      () => saveType({ ...(typeKey ? { key: typeKey } : {}), name }),
      { key: "save", suppressErrorToast: true, fallbackMessage: t("saveFailed") },
    );
    if (!outcome.ok) {
      if (!outcome.deduplicated) setError(outcome.message);
      return;
    }
    if (isNew) router.push(CLASSIFICATION_TYPES_ROOT);
    else setJustSaved(true);
  };

  const foot = isNew ? <span />
    : saved.builtIn ? <FieldHint>{t("builtInFoot")}</FieldHint>
      : inUse ? <FieldHint>{t("inUseFoot")}</FieldHint>
        : canWrite ? (
          <Button variant="ghost" className="px-0 text-destructive hover:bg-transparent hover:text-destructive" onClick={() => setRemoving(true)}>
            {t("removeType")}
          </Button>
        ) : <span />;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader back={back} icon={icon} title={isNew ? t("newTitle") : saved.nameEn} description={description} />

      <SettingsCard title={t("card")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            id="classification-type-name"
            label={t("name")}
            value={name}
            maxLength={MOST_TYPE_NAME}
            placeholder={isNew ? t("namePlaceholder") : undefined}
            hint={t("nameHint", { platformName })}
            onChange={(event) => {
              setName(event.target.value);
              edited();
            }}
          />
        </div>
      </SettingsCard>

      <SaveError>{error}</SaveError>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {foot}
        <SaveAction
          onClick={() => void save()}
          isSaving={action.isBusy("save")}
          disabled={!changed || name.trim() === ""}
          label={isNew ? t("create") : t("save")}
          savingLabel={tCommon("saving")}
          successLabel={t("saved")}
          showSuccess={justSaved}
        />
      </div>

      {!isNew ? (
        <RemoveClassificationTypeDialog
          removing={removing ? { key: saved.key, name: saved.nameEn } : null}
          onClose={() => setRemoving(false)}
          onRemoved={() => router.push(CLASSIFICATION_TYPES_ROOT)}
        />
      ) : null}
    </div>
  );
}
