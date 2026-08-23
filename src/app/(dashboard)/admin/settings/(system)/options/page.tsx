"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TerminalSquare } from "lucide-react";

import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";
import { SettingsScreen } from "../../_components/SettingsScreen";
import {
  DIAGNOSTICS_SETTINGS_FIELDS,
  useSystemSettingsForm,
} from "../../_components/useSystemSettingsForm";

type OptionRow = {
  key: "diagnosticRoutingEnabled";
  name: string;
  description: string;
};

/**
 * The developer switches, which today is one of them.
 *
 * A standard table since 2026-08-23, alongside the two other settings screens
 * that had grown their own switch-card shape. One row is a short table, and the
 * search box and pager over it are doing nothing today — they are here for the
 * same reason the Features screen keeps its own: a screen that drops them
 * because its list is short is how a section stops matching itself, and the
 * second developer switch would otherwise arrive on a screen with no way to
 * find anything.
 *
 * The page's heading is the screen's, not the row's. The old card repeated the
 * row's name and its sentence word for word, one wrapped inside the other.
 */
export default function DeveloperDiagnosticsPage() {
  const t = useTranslations("admin.settings");
  const { formData, setFormData, isLoading, isSaving, saveSuccess, save } =
    useSystemSettingsForm(DIAGNOSTICS_SETTINGS_FIELDS);

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
    matchesSearchTerm(searchTerm, [row.name, row.description])
  );
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  return (
    <SettingsScreen
      isLoading={isLoading}
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
