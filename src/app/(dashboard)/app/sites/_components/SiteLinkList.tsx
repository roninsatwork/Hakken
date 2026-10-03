"use client";

import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { ExternalUrlCell, LinkStatusLabel, RecordLinkCell } from "./SiteCells";
import { formatDay, formatNumber } from "./siteFormat";
import { useSiteRecordHref } from "./siteRecordLinks";
import { useSiteId } from "./useSite";

type Link = FunctionReturnType<typeof api.siteLinkRecords.linkingWebsiteRecord>["links"][number];

/**
 * Links, each in full, one to a block: where it is, what it links to and with
 * which words, and everything else kept about it — whether it is followed, how
 * it is marked, where on the page it sits, the kind of website, its spam score
 * and strength, and when it was seen (docs/plans/active/sites-ux-updates-plan.md
 * §4, "one link in full"). A block rather than a table row, so it reads at any
 * width; the page it links to opens its own screen. The rows are the kit's
 * `CompactList`, one column of blocks (2026-10-03 clean-up).
 */
export function SiteLinkList({ links, showWebsite = true }: { links: Link[] | undefined; showWebsite?: boolean }) {
  const t = useTranslations("sites.linkCard");
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const recordHref = useSiteRecordHref(siteId);

  const facts = (link: Link) => [
    link.attributes.length > 0 ? `${t("rel")}: ${link.attributes.join(", ")}` : null,
    link.location ? `${t("place")}: ${link.location}` : null,
    link.platformTypes.length > 0 ? `${t("kind")}: ${link.platformTypes.join(", ")}` : null,
    link.spamScore !== null ? t("spam", { value: link.spamScore }) : null,
    link.linkRank !== null ? t("strength", { value: formatNumber(link.linkRank) }) : null,
    t("websiteStrength", { value: formatNumber(link.domainRank) }),
    link.linksOnPage !== null ? t("linksOnPage", { count: formatNumber(link.linksOnPage) }) : null,
    link.indirect ? t("throughRedirect") : null,
    link.language ? t("language", { value: link.language }) : null,
    link.firstSeen ? t("firstSeen", { day: formatDay(link.firstSeen) }) : null,
    link.lastSeen ? t("lastSeen", { day: formatDay(link.lastSeen) }) : null,
  ].filter((fact): fact is string => fact !== null);

  // The kit's short list inside the card around it: its rows, rules, loading and empty lines.
  return (
    <CompactList
      rows={links}
      rowKey={(link) => link._id}
      empty={t("none")}
      loading={tr("loading")}
      columns={[
        {
          key: "link",
          cell: (link) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {showWebsite ? (
                  <RecordLinkCell href={recordHref({ kind: "domain", domain: link.domainFrom })} className="text-[13px] font-medium text-foreground">
                    {link.domainFrom}
                  </RecordLinkCell>
                ) : null}
                <StatusLabel tone={link.dofollow ? "success" : "neutral"}>{link.dofollow ? t("followed") : t("notFollowed")}</StatusLabel>
                <LinkStatusLabel status={link.status} />
                {link.isBroken ? <StatusLabel tone="warning">{t("broken", { code: link.statusCode ?? "–" })}</StatusLabel> : null}
              </div>
              <ExternalUrlCell url={link.urlFrom} />
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-secondary">
                <span>{t("anchor")}:</span>
                <span className="text-foreground">{link.anchor ?? t("noAnchor")}</span>
                <span className="text-muted">→</span>
                <span>{t("to")}</span>
                <RecordLinkCell href={recordHref({ kind: "page", page: link.pageTo })} className="break-all text-[12px] text-info">{link.pageTo || "/"}</RecordLinkCell>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">{facts(link).join(" · ")}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
