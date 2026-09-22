"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Globe, MessageSquare, Search, Sparkles, Swords } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { WebsiteScheduleOverride } from "./WebsiteScheduleOverride";
import { WatchLocation } from "./WatchLocation";

/**
 * One of a company's websites: what this client decides about it, and what it
 * is producing for them.
 *
 * **Everything this page used to configure has moved to the website record.**
 * It held a competitor table and a question list, both of which were per-client
 * copies of things that are true of the host — the same rival named by three
 * clients was three rows, the same question three purchases. They live on the
 * website now, shared by every client attached to it.
 *
 * What is left is what genuinely differs between two companies watching one
 * host: how often they pull it, and where from. Those are the two settings that
 * pass the test the others failed.
 *
 * It is also the density fix. This was a schedule, a place, two searchable
 * tables, an add form and three links down one scroll — Anthony, 2026-09-22:
 * *"too dense with information and as a user i have no idea what to do."*
 */
export default function CompanyWebsiteDetailPage() {
  const t = useTranslations("admin.companyWebsiteDetail");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const website = useQuery(api.websites.getCompanyWebsiteById, { id: companyWebsiteId });

  if (website === undefined) {
    return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (website === null) {
    return <p className="text-[13px] text-destructive">{t("notFound")}</p>;
  }

  const websitesHref = `/admin/companies/${companyId}/websites`;
  const siteHref = `${websitesHref}/site/${companyWebsiteId}`;
  const recordHref = `/admin/websites/${website.websiteId}`;

  const tracked = [
    { href: `${recordHref}/keywords`, icon: Search, label: t("tracked.keywords") },
    { href: `${recordHref}/questions`, icon: MessageSquare, label: t("tracked.questions") },
    { href: `${recordHref}/competition`, icon: Swords, label: t("tracked.competition") },
  ];

  const results = [
    { href: `${siteHref}/keywords`, icon: Search, label: t("results.keywords") },
    { href: `${siteHref}/citations`, icon: Sparkles, label: t("results.citations") },
    { href: `${siteHref}/fan-out`, icon: MessageSquare, label: t("results.fanOut") },
  ];

  const panel = (
    title: string,
    subtitle: string,
    items: Array<{ href: string; icon: typeof Search; label: string }>,
  ) => (
    <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
        <p className="max-w-3xl text-[13px] text-secondary">{subtitle}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2.5 rounded-[10px] border border-border-dim px-3 py-2.5 text-[13px] text-foreground hover:border-brand/40"
          >
            <item.icon className="h-4 w-4 shrink-0 text-muted" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: websitesHref }}
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={website.displayHost}
        description={t("subtitle")}
      />

      <WebsiteScheduleOverride
        companyWebsiteId={companyWebsiteId}
        host={website.displayHost}
        companyName={website.companyName}
        companyIntervalStr={website.companyIntervalStr}
        stored={{
          refreshIntervalStr: website.refreshIntervalStr,
          collectionEnabled: website.collectionEnabled,
        }}
        effective={website.effective}
      />

      <WatchLocation
        companyWebsiteId={companyWebsiteId}
        savedCode={website.locationCode}
      />

      {/*
        Said plainly rather than left to be discovered: editing any of these
        changes what every client watching this host sees.
      */}
      {panel(t("tracked.title"), t("tracked.subtitle"), tracked)}

      {/*
        This client's own view of shared data. The pull is shared; what is read
        out of it is scoped to the place and the holdings of whoever is looking,
        which is why these are here and not on the record.
      */}
      {panel(t("results.title"), t("results.subtitle"), results)}
    </div>
  );
}
