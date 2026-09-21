import { pascal } from "./model.mjs";
const imports = `import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";`;
const icon = '<Boxes className="w-6 h-6 text-brand" />';
export function listPage(e) {
  return `"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Boxes, Plus } from "lucide-react";
${imports}
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { useCursorPagination } from "@/src/ui/components/screens/CursorPagination";
import { EntityEditor } from "./EntityEditor";

export default function ${pascal(e.table)}Page() {
  const t = useTranslations("admin.${e.table}");
  const [search, setSearch] = useState("");
  const pager = useCursorPagination(search);
  const result = useQuery(api.${e.table}.list, { cursor: pager.cursor, search });
  const [creating, setCreating] = useState(false);
  const columns: DataTableColumn<Doc<"${e.table}">>[] = [
    { key: "${e.labelField}", header: t("columns.${e.labelField}"), cell: row => <Link className="text-foreground hover:underline" href={\`/admin/${e.route}/\${row._id}\`}>{row.${e.labelField}}</Link> },
${e.fields
  .filter((f) => f.name !== e.labelField && !f.target)
  .map(
    (f) =>
      `    { key: "${f.name}", header: t("columns.${f.name}"), cell: row => ${f.type === "boolean" ? `t(row.${f.name} ? "yes" : "no")` : `String(row.${f.name})`} },`,
  )
  .join("\n")}
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader divider icon={${icon}} title={t("title")} description={t("subtitle")}
        action={<PagePrimaryAction variant="brand" icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>{t("actions.create")}</PagePrimaryAction>} />
      <DataTable rows={result?.page} rowKey={row => row._id} columns={columns}
        search={{ value: search, onChange: value => setSearch(value.slice(0, 200)), placeholder: t("searchPlaceholder") }}
        empty={{ icon: <Boxes className="w-8 h-8 text-muted" />, label: t("empty") }}
        footer={{ mode: "cursor", page: pager.pageIndex + 1, visibleCount: result?.page.length ?? 0,
          canGoBack: pager.pageIndex > 0, canGoForward: !!result && !result.isDone, isLoading: result === undefined,
          onStep: direction => direction === "back" ? pager.previous() : result && pager.next(result.continueCursor) }} />
      {creating && <EntityEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); pager.reset(); }} />}
    </div>
  );
}
`;
}
export function editor(e) {
  const refs = e.fields.filter((f) => f.target);
  return `"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
${imports}
${refs.length ? 'import type { Id } from "@/convex/_generated/dataModel";\n' : ""}import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { Field } from "@/src/ui/components/screens/Field";
${e.fields.some((f) => f.type === "boolean") ? 'import { Checkbox } from "@/src/ui/components/screens/Checkbox";\n' : ""}import { Button } from "@/src/ui/components/screens/Button";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
${refs.map((f) => `import { ${pascal(f.name)}Picker } from "./${pascal(f.name)}Reference";`).join("\n")}

export function EntityEditor({ record, onClose, onSaved }: {
  record?: Doc<"${e.table}">; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations("admin.${e.table}");
  const canWrite = useCanWriteHere();
  const create = useMutation(api.${e.table}.create);
  const update = useMutation(api.${e.table}.update);
  // Keep the revision and values opened by this editor, even when live queries update.
  const [original] = useState(record);
  const [values, setValues] = useState({
${e.fields.map((f) => `    ${f.name}: ${f.type === "boolean" ? `record?.${f.name} ?? false` : `String(record?.${f.name} ?? "")`},`).join("\n")}
  });
  const action = useAdminAction({ scope: "${e.table}.save" });
  const saving = action.isBusy();
  const [validationError, setValidationError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const invalid = ${e.fields
      .filter((f) => f.type !== "boolean")
      .map((f) =>
        f.type === "number"
          ? `(!values.${f.name}.trim() || !Number.isFinite(Number(values.${f.name})))`
          : `!values.${f.name}.trim()`,
      )
      .join(" || ")};
    if (invalid) { setValidationError(t("invalid")); return; }
    setValidationError("");
    const input = {
${e.fields.map((f) => `        ${f.name}: ${f.type === "boolean" ? `values.${f.name}` : f.type === "number" ? `Number(values.${f.name})` : f.target ? `values.${f.name} as Id<"${f.target}">` : `values.${f.name}.trim()`},`).join("\n")}
      };
    const outcome = await action.run(() => original
      ? update({ ...input, id: original._id, expectedRevision: original.revision })
      : create(input), { fallbackMessage: t("saveFailed"), suppressErrorToast: true });
    if (outcome.ok) onSaved();
  }
  if (!canWrite) return null;
  return (
    <HakkenModal isOpen onClose={() => { if (!saving) onClose(); }} title={t(original ? "actions.edit" : "actions.create")}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
${e.fields.map((f) => (f.target ? `        <${pascal(f.name)}Picker value={values.${f.name}} disabled={saving} onChange={value => setValues(current => ({ ...current, ${f.name}: value }))} />` : f.type === "boolean" ? `        <Checkbox label={t("columns.${f.name}")} checked={values.${f.name}} disabled={saving} onChange={value => setValues(current => ({ ...current, ${f.name}: value }))} />` : `        <Field label={t("columns.${f.name}")} type="${f.type === "string" ? "text" : f.type}" ${f.type === "number" ? 'step="any"' : f.type === "string" ? `maxLength={${f.name === e.labelField ? 200 : 2000}}` : ""} required value={values.${f.name}} disabled={saving} onChange={event => setValues(current => ({ ...current, ${f.name}: event.target.value }))} />`)).join("\n")}
        <SaveError>{validationError || action.error}</SaveError>
        <div className="flex items-center justify-end gap-3">
          <Button variant="quiet" disabled={saving} onClick={onClose}>{t("actions.cancel")}</Button>
          <SaveAction type="submit" isSaving={saving} label={t("actions.save")} savingLabel={t("actions.saving")} />
        </div>
      </form>
    </HakkenModal>
  );
}
`;
}
export function detailPage(e) {
  const refs = e.fields.filter((f) => f.target);
  return `"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Boxes } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { EntityEditor } from "../EntityEditor";
${refs.map((f) => `import { ${pascal(f.name)}Value } from "../${pascal(f.name)}Reference";`).join("\n")}

export default function ${pascal(e.singular)}DetailPage() {
  const t = useTranslations("admin.${e.table}");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canWrite = useCanWriteHere();
  const record = useQuery(api.${e.table}.get, { id: id as Id<"${e.table}"> });
  const remove = useMutation(api.${e.table}.remove);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const action = useAdminAction({ scope: "${e.table}.delete" });
  const busy = action.isBusy();
  async function confirmDelete() {
    if (!record || !canWrite || busy) return;
    const outcome = await action.run(() => remove({ id: record._id, expectedRevision: record.revision }),
      { fallbackMessage: t("deleteFailed"), suppressErrorToast: true });
    if (outcome.ok) router.push("/admin/${e.route}");
  }
  return (
    <div className="flex flex-col gap-4">
      <DetailHeader icon={${icon}} back={{ label: t("actions.back"), href: "/admin/${e.route}" }}
        title={record?.${e.labelField} ?? t("title")} description={t("subtitle")}
        action={record && <PagePrimaryAction variant="brand" onClick={() => setEditing(true)}>{t("actions.edit")}</PagePrimaryAction>} />
      {record === undefined ? <p className="text-secondary" role="status">{t("loading")}</p> : record === null ? <p className="text-secondary">{t("missing")}</p> : <>
        <dl className="grid gap-4 rounded-xl border border-border-dim bg-card p-6">
${e.fields.map((f) => `          <div><dt className="text-[12px] text-secondary">{t("columns.${f.name}")}</dt><dd className="text-[13px] text-foreground break-words">{${f.target ? `<${pascal(f.name)}Value id={record.${f.name}} />` : f.type === "boolean" ? `t(record.${f.name} ? "yes" : "no")` : `String(record.${f.name})`}}</dd></div>`).join("\n")}
        </dl>
        {canWrite && <Button variant="quiet" onClick={() => { action.clearError(); setDeleting(true); }}>{t("actions.delete")}</Button>}
        {editing && <EntityEditor record={record} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
        <ConfirmationModal isOpen={deleting} onClose={() => setDeleting(false)} title={t("deleteConfirm.title")}
          cancelLabel={t("actions.cancel")} confirmLabel={t("actions.delete")} isSubmitting={busy} onConfirm={confirmDelete} error={action.error}>
          <p className="text-secondary">{t("deleteConfirm.description")}</p>
        </ConfirmationModal>
      </>}
    </div>
  );
}
`;
}
export function reference(e, field, target) {
  const P = pascal(field.name);
  return `"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { Button } from "@/src/ui/components/screens/Button";
import { useCursorPagination } from "@/src/ui/components/screens/CursorPagination";

export function ${P}Value({ id }: { id: Id<"${target.table}"> }) {
  const t = useTranslations("admin.${e.table}");
  const record = useQuery(api.${target.table}.get, { id });
  return record === undefined ? t("loading") : record === null ? t("missing") :
    <Link className="hover:underline" href={\`/admin/${target.route}/\${record._id}\`}>{record.${target.labelField}}</Link>;
}
export function ${P}Picker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const t = useTranslations("admin.${e.table}");
  const [search, setSearch] = useState("");
  const pager = useCursorPagination(search);
  const result = useQuery(api.${target.table}.list, { search, cursor: pager.cursor });
  const selected = useQuery(api.${target.table}.get, value ? { id: value as Id<"${target.table}"> } : "skip");
  return <fieldset className="flex flex-col gap-2" disabled={disabled}>
    <legend className="text-[13px] text-secondary">{t("columns.${field.name}")}</legend>
    <Field label={t("searchRelated")} value={search} maxLength={200} onChange={event => setSearch(event.target.value)} />
    <Select aria-label={t("columns.${field.name}")} value={value} onChange={onChange} disabled={disabled}>
      <option value="">{t("choose")}</option>
      {value && !result?.page.some(row => row._id === value) && <option value={value}>{selected?.${target.labelField} ?? t(selected === undefined ? "loading" : "missing")}</option>}
      {result?.page.map(row => <option key={row._id} value={row._id}>{row.${target.labelField}}</option>)}
    </Select>
    <div className="flex items-center gap-2">
      <Button variant="quiet" disabled={disabled || !result || pager.pageIndex === 0} onClick={pager.previous}>{t("previous")}</Button>
      <Button variant="quiet" disabled={disabled || !result || result.isDone} onClick={() => result && pager.next(result.continueCursor)}>{t("next")}</Button>
      <span className="text-[12px] text-secondary" role="status">{!result ? t("loading") : !result.page.length ? t("empty") : t("page", { page: pager.pageIndex + 1 })}</span>
    </div>
  </fieldset>;
}
`;
}
export function errorPage(e) {
  return `"use client";
import { useTranslations } from "next-intl";
import { Boxes } from "lucide-react";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
export default function FeatureError({ reset }: { reset: () => void }) {
  const t = useTranslations("admin.${e.table}");
  return <div className="flex flex-col gap-4">
    <DetailHeader icon={${icon}} title={t("loadFailed")} back={{ label: t("actions.back"), href: "/admin/${e.route}" }} />
    <Button variant="quiet" onClick={reset}>{t("retry")}</Button>
  </div>;
}
`;
}
