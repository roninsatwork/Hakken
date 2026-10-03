"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/components/screens/Button";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Field } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { SECTION_ICONS } from "../../../_components/websitesSection";
import { AddBar } from "../../../_components/AddBar";
import {
  CLASSIFICATION_TYPES,
  LINE_KINDS,
  classificationListHref,
  useClassificationWords,
  type ClassificationType,
  type LineKind,
} from "./classificationWords";
import { RemoveClassificationDialog } from "./RemoveClassificationDialog";

type Preview = NonNullable<FunctionReturnType<typeof api.pageClassifications.pageClassificationPreview>>;
/** A line as it is being edited: `key` keeps its row while lines come and go. */
type DraftLine = { key: string; kind: LineKind; value: string };

const LEAD = "max-w-2xl text-[12px] leading-relaxed text-secondary";

const plain = (lines: readonly { kind: LineKind; value: string }[]) => lines.map(({ kind, value }) => ({ kind, value }));

/**
 * A classification's own page (docs/plans/active/page-groups-plan.md,
 * decision 6, drawn as board 22b) — a page, never a pop-up, since it has
 * fields: its name and type, the address lines that catch its pages, and
 * the pages it has as the lines read now. "Its pages" follows each line added
 * or removed before anything is saved, and each line says how many pages it
 * catches, or why it can't be kept; Save sends the name, type and lines
 * together. `classificationId` is null for a new one, which goes back to the
 * Classifications view once added.
 */
export function ClassificationEditor({ companyId, companyWebsiteId, classificationId }: {
  companyId: Id<"companies">;
  companyWebsiteId: Id<"companyWebsites">;
  classificationId: Id<"pageClassifications"> | null;
}) {
  const t = useTranslations("admin.siteView.classification.edit");
  const tClassification = useTranslations("admin.siteView.classification");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const words = useClassificationWords();
  const router = useRouter();
  const canWrite = useCanWriteHere();
  const listHref = classificationListHref(companyId, companyWebsiteId);

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const owned = header?.relationship === "OWNED";
  const saved = useQuery(api.pageClassifications.pageClassificationDetail, owned && classificationId ? { companyWebsiteId, classificationId } : "skip");
  const create = useMutation(api.pageClassifications.createPageClassification);
  const update = useMutation(api.pageClassifications.updatePageClassification);
  const action = useAdminAction({ scope: "admin-page-classification-edit" });

  const [adopted, setAdopted] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<ClassificationType>("OTHER");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [added, setAdded] = useState(0);
  const [newKind, setNewKind] = useState<LineKind>("STARTS_WITH");
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [removing, setRemoving] = useState(false);

  // What is saved is adopted once per saved state, keyed on the values, so an
  // edit in progress survives the query refreshing.
  const savedKey = saved ? JSON.stringify([saved.name, saved.type, plain(saved.lines)]) : null;
  if (saved && savedKey !== adopted) {
    setAdopted(savedKey);
    setName(saved.name);
    setType(saved.type);
    setLines(saved.lines.map((line) => ({ key: line._id, kind: line.kind, value: line.value })));
  }

  const ready = owned && (classificationId === null || Boolean(saved));
  const preview = useQuery(
    api.pageClassifications.pageClassificationPreview,
    ready ? { companyWebsiteId, ...(classificationId ? { classificationId } : {}), lines: plain(lines) } : "skip",
  );
  // The last answer stays on screen while the next is on its way, so the list
  // doesn't flash empty at each line. Kept by what it says, not by reference.
  const [kept, setKept] = useState<{ key: string; preview: Preview } | null>(null);
  const previewKey = preview ? JSON.stringify(preview) : null;
  if (preview && previewKey !== null && previewKey !== kept?.key) setKept({ key: previewKey, preview });
  const shown = kept?.preview ?? null;

  if (header === undefined || (owned && classificationId !== null && saved === undefined)) {
    return <p className="text-[13px] text-secondary">{tClassification("loading")}</p>;
  }
  if (header === null) return null;

  const Icon = SECTION_ICONS.classification;
  const back = { label: t("back"), href: listHref };
  if (!owned || (classificationId !== null && saved === null)) {
    return (
      <div className="flex flex-col gap-6">
        <DetailHeader back={back} icon={<Icon className="h-6 w-6 text-brand" />} title={t("newTitle")} />
        <Notice>{owned ? t("notFound") : tClassification("competitor")}</Notice>
      </div>
    );
  }

  const linesMatch = shown !== null && shown.lines.length === lines.length;
  const changed = classificationId === null
    || (saved !== undefined && saved !== null && (name !== saved.name || type !== saved.type || JSON.stringify(plain(lines)) !== JSON.stringify(plain(saved.lines))));

  const edited = () => {
    setJustSaved(false);
    setError("");
  };
  const addLine = () => {
    const value = newValue.trim();
    if (!value) return;
    setLines([...lines, { key: `added-${added}`, kind: newKind, value }]);
    setAdded(added + 1);
    setNewValue("");
    edited();
  };
  const removeLine = (key: string) => {
    setLines(lines.filter((line) => line.key !== key));
    edited();
  };

  const save = async () => {
    setError("");
    setJustSaved(false);
    const outcome = await action.run(
      async () => {
        if (classificationId) await update({ companyWebsiteId, classificationId, name, type, lines: plain(lines) });
        else await create({ companyWebsiteId, name, type, lines: plain(lines) });
      },
      { key: "save", suppressErrorToast: true, fallbackMessage: t("saveFailed") },
    );
    if (!outcome.ok) {
      if (!outcome.deduplicated) setError(outcome.message);
      return;
    }
    if (classificationId) setJustSaved(true);
    else router.push(listHref);
  };

  // How many pages a line catches, or why it can't be kept.
  const lineNote = (index: number) => {
    const note = linesMatch ? shown.lines[index] : undefined;
    if (!note) return <span className="font-mono text-[12px] text-muted">…</span>;
    if (note.problem) return <StatusLabel tone="warning" wrap>{t(`problems.${note.problem}`, { name: note.on ?? "" })}</StatusLabel>;
    return <span className="whitespace-nowrap font-mono text-[12px] text-secondary">{t("catches", { count: note.catches })}</span>;
  };

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<Icon className="h-6 w-6 text-brand" />}
        title={name.trim() || saved?.name || t("newTitle")}
        description={t("description", { host: header.displayHost })}
      />

      <SettingsCard title={t("card")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            id="classification-name"
            label={t("name")}
            value={name}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
              edited();
            }}
          />
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="classification-type">{t("type")}</FieldLabel>
            <Select
              id="classification-type"
              value={type}
              onChange={(next) => {
                setType(next as ClassificationType);
                edited();
              }}
              className="w-full"
              selectClassName="h-[46px] rounded-[12px]"
            >
              {CLASSIFICATION_TYPES.map((each) => <option key={each} value={each}>{words.type(each)}</option>)}
            </Select>
            <FieldHint>{t("typeHint")}</FieldHint>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t("whichPages")}>
        <p className={LEAD}>{t("whichLead")}</p>
        <CompactList
          rows={lines.map((line, index) => ({ ...line, index }))}
          rowKey={(line) => line.key}
          empty={t("noLines")}
          columns={[
            { key: "kind", className: "w-[210px]", cell: (line) => <span className="text-[13px] text-secondary">{words.kind(line.kind)}</span> },
            { key: "value", cell: (line) => <span className="break-all font-mono text-[12px] text-foreground">{line.value}</span> },
            { key: "catches", align: "right", cell: (line) => lineNote(line.index) },
            {
              key: "remove",
              align: "right",
              className: "w-12",
              cell: (line) => (
                <RowIconButton label={t("removeLine")} tone="danger" onClick={() => removeLine(line.key)}>
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              ),
            },
          ]}
        />
        <AddBar label={t("addLine")} disabled={newValue.trim() === ""} onAdd={addLine}>
          <div className="flex w-full flex-col gap-1.5 sm:w-[230px]">
            <FieldLabel htmlFor="classification-line-kind">{t("kindLabel")}</FieldLabel>
            <Select
              id="classification-line-kind"
              value={newKind}
              onChange={(next) => setNewKind(next as LineKind)}
              className="w-full"
              selectClassName="h-[46px] rounded-[12px]"
            >
              {LINE_KINDS.map((kind) => <option key={kind} value={kind}>{words.kind(kind)}</option>)}
            </Select>
          </div>
          <Field
            id="classification-line-value"
            label={t("valueLabel")}
            value={newValue}
            placeholder={t(`placeholders.${newKind}`)}
            onChange={(event) => setNewValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addLine();
            }}
            wrapperClassName="min-w-[16rem] flex-1"
          />
        </AddBar>
      </SettingsCard>

      <SettingsCard title={t("itsPages", { count: shown ? format.number(shown.total) : "…" })}>
        <p className={LEAD}>{t("itsLead")}</p>
        <CompactList
          rows={shown?.rows}
          rowKey={(row) => row.page}
          empty={t("itsEmpty")}
          loading={tClassification("loading")}
          columns={[
            { key: "page", header: t("columns.page"), cell: (row) => <span className="break-all text-[12px] text-info">{row.page}</span> },
            {
              key: "by",
              header: t("columns.by"),
              cell: (row) => <span className="text-[12px] text-secondary">{row.how === "BY_HAND" || !row.line ? t("byHand") : words.line(row.line)}</span>,
            },
            {
              key: "clicks",
              header: t("columns.clicks"),
              align: "right",
              cell: (row) => <span className="font-mono text-[12px] text-secondary">{format.number(row.clicks)}</span>,
            },
          ]}
        />
        {shown && shown.total > shown.rows.length ? <FieldHint>{t("more", { count: shown.total - shown.rows.length })}</FieldHint> : null}
        {shown?.cut ? <FieldHint>{t("cut")}</FieldHint> : null}
      </SettingsCard>

      <SaveError>{error}</SaveError>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {classificationId && canWrite ? (
          <Button variant="ghost" className="px-0 text-destructive hover:bg-transparent hover:text-destructive" onClick={() => setRemoving(true)}>
            {t("remove")}
          </Button>
        ) : <span />}
        <SaveAction
          onClick={() => void save()}
          isSaving={action.isBusy("save")}
          disabled={!changed || name.trim() === ""}
          label={classificationId ? t("save") : t("create")}
          savingLabel={tCommon("saving")}
          successLabel={t("saved")}
          showSuccess={justSaved}
        />
      </div>

      {classificationId ? (
        <RemoveClassificationDialog
          companyWebsiteId={companyWebsiteId}
          removing={removing ? { _id: classificationId, name: saved?.name ?? name, lines: saved?.lines.length ?? 0, byHand: shown?.byHand ?? 0 } : null}
          onClose={() => setRemoving(false)}
          onRemoved={() => router.push(listHref)}
        />
      ) : null}
    </div>
  );
}
