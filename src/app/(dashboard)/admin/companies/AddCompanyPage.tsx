"use client";

import { useMutation } from "convex/react";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Field } from "@/src/ui/components/screens/Field";
import { HostField } from "../_components/HostField";
// Admin → Content's page for adding a record, and its form: an add is a page,
// never a pop-up, and every such page is the same one.
import { ContentEditPage } from "../content/_components/ContentEditPage";
import { useContentForm } from "../content/_components/useContentForm";

const BASE = "/admin/companies";

type CompanyForm = { name: string; websiteUrl: string };
const EMPTY: CompanyForm = { name: "", websiteUrl: "" };

/**
 * Add company (docs/plans/active/add-company-page-plan.md, board 3): the
 * company's name and its website, held as its own in the same save. Adding
 * opens the company; its plan, its features and the assistant's instructions
 * for it are set in its own tabs, so they are not asked here.
 */
export function AddCompanyPage() {
  const t = useTranslations("admin.companies");
  const tWebsites = useTranslations("admin.companyWebsites");
  const createCompany = useMutation(api.companies.createCompany);
  const editor = useContentForm({
    scope: "admin-company-add",
    row: null,
    empty: EMPTY,
    toForm: (form: CompanyForm) => form,
    save: (form) => {
      return createCompany({ name: form.name.trim(), websiteUrl: form.websiteUrl.trim() });
    },
    backHref: BASE,
    doneHref: (companyId) => `${BASE}/${String(companyId)}`,
    saveFailed: t("add.saveFailed"),
  });

  return (
    <ContentEditPage
      state="ready"
      back={{ label: t("title"), href: BASE }}
      icon={<Building2 className="h-6 w-6 text-brand" />}
      title={t("add.title")}
      description={t("add.subtitle")}
      error={editor.error}
      isSaving={editor.isSaving}
      saveLabel={t("add.save")}
      onSubmit={editor.submit}
    >
      <div className="grid gap-5 md:grid-cols-2 md:items-start">
        <Field
          label={t("nameLabel")}
          required
          value={editor.form.name}
          onChange={(event) => editor.update({ name: event.target.value })}
          placeholder={t("namePlaceholder")}
        />
        <HostField
          look="page"
          label={tWebsites("urlLabel")}
          placeholder={tWebsites("urlPlaceholder")}
          value={editor.form.websiteUrl}
          onChange={(websiteUrl) => editor.update({ websiteUrl })}
          labels={{
            savedAs: (host) => tWebsites("savedAs", { host }),
            alreadyKnown: tWebsites("alreadyKnown"),
            newWebsite: tWebsites("newWebsite"),
            inherits: (counts) => tWebsites("inherits", counts),
          }}
        />
      </div>
    </ContentEditPage>
  );
}
