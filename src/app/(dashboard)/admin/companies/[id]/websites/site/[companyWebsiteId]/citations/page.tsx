"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";

/**
 * Where this website gets named inside AI answers.
 *
 * One row per answer: the question, the engine, the day, whether this site was
 * named and where, and **everyone else who was**. That last column is the
 * reason the feature sells — it names the rivals a client never thought to
 * list, and it costs nothing extra because the answer named them anyway.
 *
 * Its own page under the website rather than a third table on the site's
 * detail. The detail is settings — competitors, place, questions — and this is
 * results; putting results under a settings form pushes the form below the
 * fold the moment there are any.
 *
 * Read through the company's own hold on the website, never from the shared
 * citation table outward. That direction is what keeps one client's rivals
 * off another client's screen.
 */
export default function WebsiteCitationsPage() {
  const t = useTranslations("admin.websiteCitations");
  const params = useParams();
  const companyId = params.id as string;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const website = useQuery(api.websites.getCompanyWebsiteById, { id: companyWebsiteId });
  const citations = useQuery(api.seoCitationReports.listCompanyWebsiteCitations, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const backHref = `/admin/companies/${companyId}/websites/site/${companyWebsiteId}`;

  // Literal keys, one per engine, because the translation keys are typed and a
  // template over the union is not one of them.
  const engineLabel = (engine: string) => {
    if (engine === "chatgpt") return t("engines.chatgpt");
    if (engine === "claude") return t("engines.claude");
    if (engine === "gemini") return t("engines.gemini");
    if (engine === "perplexity") return t("engines.perplexity");
    return engine;
  };

  if (website === null) {
    return <p className="py-12 text-center text-[13px] text-muted">{t("notFound")}</p>;
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: backHref }}
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={website?.displayHost ?? ""}
        description={t("subtitle")}
      />

      <DataTable
        rows={citations === undefined ? undefined : citations.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[860px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Sparkles className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: citations?.totalPages ?? 1,
          totalCount: citations?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: citations === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "prompt",
            header: t("promptColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.prompt}</span>
                <span className="text-[11px] text-muted">{row.day}</span>
              </div>
            ),
          },
          {
            key: "engine",
            header: t("engineColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{engineLabel(row.engine)}</span>
            ),
          },
          {
            key: "us",
            header: t("usColumn"),
            cell: (row) => (
              row.status === "FAILED" ? (
                // Not "waiting": nothing is coming. The reason sits on the
                // collection screen; here the client only needs to know the
                // engine could not be asked this time.
                <StatusPill tone="danger">{t("couldNotAsk")}</StatusPill>
              ) : row.status !== "READY" ? (
                <StatusPill tone="neutral">{t("waiting")}</StatusPill>
              ) : row.ourPosition === null ? (
                <StatusPill tone="neutral">{t("notNamed")}</StatusPill>
              ) : (
                <div className="flex flex-col gap-1">
                  {/*
                    Being named is not the same as being recommended. An answer
                    that warns against a business still names it, and without
                    the stance that reads as a win.
                  */}
                  <StatusPill tone={row.ourStance === "WARNED_AGAINST" ? "danger" : "success"}>
                    {row.ourStance === "RECOMMENDED"
                      ? t("recommendedAt", { position: row.ourPosition })
                      : row.ourStance === "WARNED_AGAINST"
                        ? t("warnedAgainst")
                        : t("namedAt", { position: row.ourPosition })}
                  </StatusPill>
                  {/*
                    A citation under the wrong name is a different fact from
                    one under the right name, and the one a client can act on.
                  */}
                  {row.ourVariantKind === "MISSPELLING" ? (
                    <span className="text-[11px] text-warning">{t("misspelled")}</span>
                  ) : null}
                </div>
              )
            ),
          },
          {
            key: "others",
            header: t("othersColumn"),
            cell: (row) => (
              <div className="flex max-w-md flex-wrap gap-1">
                {row.others.length === 0 ? (
                  <span className="text-[12px] text-muted">{t("nobodyElse")}</span>
                ) : row.others.slice(0, 8).map((other, index) => (
                  <span
                    key={`${other.text}-${index}`}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      // A name we hold is one somebody is already tracking; a
                      // name we do not is a rival nobody thought to list.
                      other.websiteId
                        ? "border-border-dim bg-foreground/5 text-secondary"
                        : "border-warning/30 bg-warning/5 text-warning"
                    }`}
                    title={other.kind === "SOURCE" ? t("citedAsSource") : t("namedInAnswer")}
                  >
                    {other.text}
                    {other.stance === "RECOMMENDED" ? ` ${t("chipRecommended")}` : ""}
                  </span>
                ))}
                {row.others.length > 8 ? (
                  <span className="text-[11px] text-muted">
                    {t("more", { count: row.others.length - 8 })}
                  </span>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
