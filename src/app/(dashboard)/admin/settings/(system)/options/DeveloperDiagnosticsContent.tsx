"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { TerminalSquare } from "lucide-react";

import type { SystemSettingsFormData } from "../../_components/types";
import { SettingsScreen } from "../../_components/SettingsScreen";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";

type OptionRow = {
  key: "diagnosticRoutingEnabled";
  name: string;
  description: string;
};

type DeveloperDiagnosticsContentProps = {
  formData: SystemSettingsFormData;
  setFormData: Dispatch<SetStateAction<SystemSettingsFormData>>;
  isSaving: boolean;
  saveSuccess: boolean;
  save: () => Promise<void>;
};

export function DeveloperDiagnosticsContent({
  formData,
  setFormData,
  isSaving,
  saveSuccess,
  save,
}: DeveloperDiagnosticsContentProps) {
  const t = useTranslations("admin.settings");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const options: OptionRow[] = [
    {
      key: "diagnosticRoutingEnabled",
      name: t("options.routingMatrix"),
      description: t("options.routingMatrixSub"),
    },
  ];

  const matching = options.filter((row) =>
    matchesSearchTerm(searchTerm, [row.name, row.description]),
  );
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  return (
    <SettingsScreen
      save={{
        onSave: save,
        isSaving,
        saveSuccess,
        label: t("save"),
        savingLabel: t("saving"),
        successLabel: t("success"),
      }}
    >
      <PageHeader
        icon={<TerminalSquare className="w-6 h-6 text-brand" />}
        title={t("options.title")}
        description={t("options.subtitle")}
      />

      <DataTable
        rows={paged.items}
        rowKey={(row) => row.key}
        minWidthClassName="min-w-[640px]"
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            setPage(1);
          },
          placeholder: t("options.searchPlaceholder"),
        }}
        empty={{
          icon: <TerminalSquare className="w-8 h-8 text-muted/30" />,
          label: t("options.emptyState"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: false,
          onPageChange: setPage,
          labels: { empty: t("options.emptyState") },
        }}
        columns={[
          {
            key: "option",
            header: t("options.nameColumn"),
            className: "w-[240px]",
            cell: (row) => (
              <span className="text-[13px] font-medium text-foreground">{row.name}</span>
            ),
          },
          {
            key: "description",
            header: t("options.descriptionColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{row.description}</span>
            ),
          },
          {
            key: "on",
            header: t("options.onColumn"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (row) => (
              <Checkbox
                label={row.name}
                labelHidden
                checked={Boolean(formData[row.key])}
                onChange={(next) => setFormData({ ...formData, [row.key]: next })}
              />
            ),
          },
        ]}
      />
    </SettingsScreen>
  );
}
