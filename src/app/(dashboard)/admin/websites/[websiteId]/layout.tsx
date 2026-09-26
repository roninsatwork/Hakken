"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, FileText, Globe, Swords, Trash2, Users } from "lucide-react";
import Link from "next/link";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DetailLayout } from "@/src/ui/components/screens/DetailLayout";
import { PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";

const loadDeleteDialog = () => import("./DeleteWebsiteDialog");
const DeleteWebsiteDialog = lazy(() =>
  loadDeleteDialog().then((module) => ({ default: module.DeleteWebsiteDialog })),
);

/**
 * One website, as a record with tabs rather than one scroll.
 *
 * It held brand names and a watcher list on a single page until the host's own
 * lists arrived; with searches, questions and a competition graph beside them
 * that page would be the same fault the client-side screen has — five jobs down
 * one scroll. `DetailLayout` draws the title, the rule and the tab strip, the
 * same as companies and agents.
 *
 * **Delete lives here rather than on a tab**, because it is an action on the
 * record and not on any one part of it, and because it is the one thing on this
 * screen that reaches every company watching the host.
 */
export default function WebsiteRecordLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.websiteDetail");
  const params = useParams();
  const router = useRouter();
  const websiteId = params.websiteId as Id<"websites">;

  const website = useQuery(api.websites.getWebsiteById, { id: websiteId });
  const deleteWebsite = useMutation(api.websites.deleteWebsite);
  const action = useAdminAction({ scope: "admin-website-detail" });

  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [dialogActivated, setDialogActivated] = useState(false);

  if (website === undefined) {
    return <p className="p-8 text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (website === null) {
    return <p className="p-8 text-[13px] text-destructive">{t("notFound")}</p>;
  }

  const handleOpenDelete = () => {
    void loadDeleteDialog();
    setDialogActivated(true);
    setError("");
    setIsDeleting(true);
  };

  const confirmDelete = async () => {
    setError("");
    const outcome = await action.run(() => deleteWebsite({ id: websiteId }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.deleteFailed"),
    });

    if (outcome.ok) {
      setIsDeleting(false);
      router.push("/admin/websites");
    } else {
      setError(outcome.message);
    }
  };

  const rootHref = `/admin/websites/${websiteId}`;
  const tabs = [
    { label: t("tabs.profile"), href: rootHref, icon: FileText },
    // The searches and questions are each company's own, set on that
    // company's screen for the website (docs/plans/active/
    // private-tracking-lists-plan.md, V4), so the record has no tab for them.
    { label: t("tabs.competition"), href: `${rootHref}/competition`, icon: Swords },
    { label: t("tabs.watchers"), href: `${rootHref}/watchers`, icon: Users },
  ];

  return (
    <>
      <DetailLayout
        rootHref={rootHref}
        tabs={tabs}
        leading={<Globe className="h-6 w-6 text-brand" />}
        title={website.displayHost}
        description={
          website.nextPullAt
            ? t("nextPullAt", { when: formatDateTime(website.nextPullAt) })
            : t("notFetched")
        }
        actions={
          <>
            <PagePrimaryAction icon={<Trash2 className="h-4 w-4" />} onClick={handleOpenDelete}>
              {t("deleteWebsite")}
            </PagePrimaryAction>
            {/* The way back to the list, as the Companies section has one. */}
            <Link
              href="/admin/websites"
              className="flex items-center gap-2 rounded-[10px] border border-border-dim/50 bg-foreground/5 px-5 py-2 text-[13px] font-medium text-foreground transition-all hover:bg-foreground/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t("back")}
            </Link>
          </>
        }
      >
        {children}
      </DetailLayout>

      {dialogActivated ? (
        <Suspense fallback={null}>
          <DeleteWebsiteDialog
            host={isDeleting ? website.displayHost : null}
            affected={website.watchers.map((watcher) => ({
              companyName: watcher.companyName,
              detail: watcher.againstHost
                ? t("lostAsCompetitorOf", { host: watcher.againstHost })
                : t("lostAsTheirOwn"),
            }))}
            onClose={() => {
              setIsDeleting(false);
              setError("");
            }}
            onConfirm={confirmDelete}
            isSubmitting={action.isBusy()}
            error={error}
          />
        </Suspense>
      ) : null}
    </>
  );
}
