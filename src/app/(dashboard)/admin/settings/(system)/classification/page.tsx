"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CLASSIFICATION_TYPES_ROOT, classificationTypeHref } from "./classificationTypeRoutes";
import { RemoveClassificationTypeDialog, type RemovingType } from "./RemoveClassificationTypeDialog";

type TypeRow = FunctionReturnType<typeof api.classificationTypes.classificationTypeList>["types"][number];

/**
 * System Settings → Classification (docs/plans/active/classification-types-
 * plan.md, CT2; drawn as board 1, approved 2026-10-15): the page types every
 * company's classifications pick from, and how many classifications use
 * each. The pencil, or the row, opens the type's own page;
 * the bin, after a yes, removes an added type no classification uses. A page
 * inside System Settings, so its header has no rule of its own.
 */
export default function ClassificationTypesPage() {
  const t = useTranslations("admin.classificationTypes");
  const format = useFormatter();
  const language = useLocale();
  const router = useRouter();
  const data = useQuery(api.classificationTypes.classificationTypeList, { language });
  const [pageNumber, setPageNumber] = useState(1);
  const [removing, setRemoving] = useState<RemovingType | null>(null);

  const rows = data?.types;
  const full = data !== undefined && data.types.length >= data.most;
  const totalPages = Math.max(1, Math.ceil((rows?.length ?? 0) / TABLE_PAGE_SIZE));
  const safePage = Math.min(pageNumber, totalPages);
  const open = (row: TypeRow) => router.push(classificationTypeHref(row.key));
  const removable = (row: TypeRow) => !row.builtIn && row.classifications === 0 && !row.more;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Layers className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={(
          // A disabled button shows no tooltip, so the reason sits on what holds it.
          <span title={full ? t("addFullTip", { most: data?.most ?? 0 }) : undefined}>
            <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} disabled={full} onClick={() => router.push(`${CLASSIFICATION_TYPES_ROOT}/new`)}>
              {t("add")}
            </PagePrimaryAction>
          </span>
        )}
      />

      <DataTable
        rows={rows?.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE)}
        rowKey={(row) => row.key}
        onRowClick={open}
        cardHeader={<TableBar footer={{ isLoading: data === undefined, totalCount: rows?.length ?? 0 }} noun="types" />}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: safePage,
          totalPages,
          totalCount: rows?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: data === undefined,
          onPageChange: setPageNumber,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "name",
            header: t("columns.type"),
            cell: (row) => <span className="text-[13px] font-medium text-foreground">{row.name}</span>,
          },
          {
            key: "classifications",
            header: t("columns.usedBy"),
            align: "right",
            className: "w-32",
            cell: (row) => (
              <span className="font-mono text-[12px] text-secondary">
                {row.more ? t("more", { count: format.number(data?.counted ?? row.classifications) }) : format.number(row.classifications)}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            hiddenHeader: t("columns.actions"),
            align: "right",
            className: "w-24",
            cell: (row) => (
              <RowActions alwaysVisible>
                <RowIconButton navigates label={t("edit", { name: row.name })} onClick={() => open(row)}>
                  <Pencil className="h-4 w-4" />
                </RowIconButton>
                {removable(row) ? (
                  <RowIconButton tone="danger" label={t("remove", { name: row.name })} onClick={() => setRemoving({ key: row.key, name: row.name })}>
                    <Trash2 className="h-4 w-4" />
                  </RowIconButton>
                ) : null}
              </RowActions>
            ),
          },
        ]}
      />

      <RemoveClassificationTypeDialog removing={removing} onClose={() => setRemoving(null)} onRemoved={() => setRemoving(null)} />
    </div>
  );
}
