"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";
import { SettingsScreen } from "../../_components/SettingsScreen";
import type { PiiConfig } from "../../_components/types";

/** The switches this screen owns, in the order they read. */
type MaskKey = "enabled" | "maskEmails" | "maskCreditCards" | "maskNinos" | "maskPhones";

type MaskingRow = {
  key: MaskKey;
  name: string;
  description: string;
  /** The engine itself. The four rows under it do nothing until this is on. */
  isEngine: boolean;
};

/**
 * What gets hidden from a prompt before the model sees it.
 *
 * A standard table since 2026-08-23. It was a column of bordered rows with a
 * toggle glyph on the right of each — the same shape the workspace Features
 * screen carried until the day before, and the same complaint from Anthony
 * with the screen open: the system settings tables *"look hand drawn and need
 * to be standardised"*. The switch-card shape was never a shared part; it was
 * copied by eye between three settings screens, and every copy was one more
 * place for the section to stop matching itself.
 *
 * The engine is row one rather than a control above the table. It is a switch
 * like the four below it, and lifting it out would leave a table of four rows
 * with a fifth switch floating over them — which is how the bespoke shape
 * started. The dependency survives instead as the thing it always was: with the
 * engine off the four rows dim and their boxes refuse the click.
 *
 * The green-vs-grey toggle glyphs went with the shape. Colour was the only
 * thing saying whether a field was masked, which is unreadable to anyone who
 * cannot separate green from grey; the house tick box says it with a tick.
 */
export default function SystemSecurityPage() {
  const t = useTranslations("admin.settings");
  const currentPiiConfig = useQuery(api.system.getPiiConfig);
  const updatePiiConfig = useMutation(api.system.updatePiiConfig);

  const [piiData, setPiiData] = useState<PiiConfig>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (currentPiiConfig) setPiiData(currentPiiConfig);
  }, [currentPiiConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePiiConfig({ configStr: JSON.stringify(piiData) });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // Built here rather than at module scope so every key is a literal the
  // messages check can follow to the catalogue.
  const switches: MaskingRow[] = [
    {
      key: "enabled",
      name: t("security.masterToggle"),
      description: t("security.masterToggleSub"),
      isEngine: true,
    },
    {
      key: "maskEmails",
      name: t("security.maskEmails"),
      description: t("security.maskEmailsSub"),
      isEngine: false,
    },
    {
      key: "maskCreditCards",
      name: t("security.maskCreditCards"),
      description: t("security.maskCreditCardsSub"),
      isEngine: false,
    },
    {
      key: "maskNinos",
      name: t("security.maskNi"),
      description: t("security.maskNiSub"),
      isEngine: false,
    },
    {
      key: "maskPhones",
      name: t("security.maskPhones"),
      description: t("security.maskPhonesSub"),
      isEngine: false,
    },
  ];

  const engineOn = piiData.enabled ?? false;
  const matching = switches.filter((row) =>
    matchesSearchTerm(searchTerm, [row.name, row.description])
  );
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  const setSwitch = (key: MaskKey, next: boolean) =>
    setPiiData((previous): PiiConfig => ({ ...previous, [key]: next }));

  return (
    <SettingsScreen
      isLoading={currentPiiConfig === undefined}
      save={{
        onSave: handleSave,
        isSaving,
        saveSuccess,
        label: t("save"),
        savingLabel: t("saving"),
        successLabel: t("success"),
      }}
    >
      <PageHeader
        icon={<ShieldCheck className="w-6 h-6 text-brand" />}
        title={t("security.redaction")}
        description={t("security.redactionSub")}
      />

      <DataTable
        rows={paged.items}
        rowKey={(row) => row.key}
        minWidthClassName="min-w-[640px]"
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            // Page 3 of a search that now has one page of results is an empty
            // table, so a new search always starts at the top.
            setPage(1);
          },
          placeholder: t("security.searchPlaceholder"),
        }}
        empty={{
          icon: <ShieldCheck className="w-8 h-8 text-muted/30" />,
          label: t("security.emptyState"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: false,
          onPageChange: setPage,
          labels: { empty: t("security.emptyState") },
        }}
        // What the dimming said before it was a table: these four do nothing
        // while the engine is off.
        rowClassName={(row) => (row.isEngine || engineOn ? "" : "opacity-50")}
        columns={[
          {
            key: "switch",
            header: t("security.nameColumn"),
            className: "w-[240px]",
            cell: (row) => (
              <span className="text-[13px] font-medium text-foreground">{row.name}</span>
            ),
          },
          {
            key: "description",
            header: t("security.descriptionColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{row.description}</span>
            ),
          },
          {
            key: "on",
            header: t("security.onColumn"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            // The first column already names the switch, so the box keeps its
            // label for whoever is listening and drops it for whoever is
            // looking.
            cell: (row) => (
              <Checkbox
                label={row.name}
                labelHidden
                checked={piiData[row.key] ?? false}
                disabled={!row.isEngine && !engineOn}
                onChange={(next) => setSwitch(row.key, next)}
              />
            ),
          },
        ]}
      />
    </SettingsScreen>
  );
}
