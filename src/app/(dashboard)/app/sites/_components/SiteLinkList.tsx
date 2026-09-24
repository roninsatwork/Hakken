"use client";

import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { ExternalUrlCell, LinkStatusPill, RecordLinkCell } from "./SiteCells";
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
 * width; the page it links to opens its own screen.
 */
export function SiteLinkList({ links, showWebsite = true }: { links: Link[] | undefined; showWebsite?: boolean }) {
  const t = useTranslations("sites.linkCard");
  const siteId = useSiteId();
  const recordHref = useSiteRecordHref(siteId);
  if (links === undefined) return <div className="h-24 animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />;
  if (links.length === 0) return <p className="text-[13px] text-secondary">{t("none")}</p>;

  return (
    <ul className="flex flex-col divide-y divide-border-dim">
      {links.map((link) => {
        const facts = [
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
        return (
          <li key={link._id} className="flex flex-col gap-1.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {showWebsite ? (
                <RecordLinkCell href={recordHref({ kind: "domain", domain: link.domainFrom })} className="text-[13px] font-medium text-foreground">
                  {link.domainFrom}
                </RecordLinkCell>
              ) : null}
              <StatusPill tone={link.dofollow ? "success" : "neutral"}>{link.dofollow ? t("followed") : t("notFollowed")}</StatusPill>
              <LinkStatusPill status={link.status} />
              {link.isBroken ? <StatusPill tone="warning">{t("broken", { code: link.statusCode ?? "–" })}</StatusPill> : null}
            </div>
            <ExternalUrlCell url={link.urlFrom} />
            <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-secondary">
              <span>{t("anchor")}:</span>
              <span className="text-foreground">{link.anchor ?? t("noAnchor")}</span>
              <span className="text-muted">→</span>
              <span>{t("to")}</span>
              <RecordLinkCell href={recordHref({ kind: "page", page: link.pageTo })} className="break-all text-[12px] text-info">{link.pageTo || "/"}</RecordLinkCell>
            </div>
            <p className="text-[11px] leading-relaxed text-muted">{facts.join(" · ")}</p>
          </li>
        );
      })}
    </ul>
  );
}
