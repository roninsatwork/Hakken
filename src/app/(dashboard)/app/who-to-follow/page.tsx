"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { ExternalLink, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { LearnShell } from "../_learn/LearnShell";

/**
 * Who to follow (docs/plans/active/knowledge-news-and-digest-plan.md, phase
 * 3), on its own page in Learn since 2026-10-01 (R4, R11): the people and
 * channels we recommend, where to find them, and why, in the reader's
 * language. Each opens where they post.
 */
export default function WhoToFollowPage() {
  const t = useTranslations("learn.follow");
  const tNews = useTranslations("news");
  const language = useLocale();
  const follows = useQuery(api.newsFollows.listFollows, { language });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows = follows?.filter((follow) => matchesSearchTerm(search, [follow.name, follow.why]));
  const paged = paginateItems(rows ?? [], page);

  return (
    <LearnShell header={<PageHeader icon={<Users className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />}>
      <DataTable
        rows={rows === undefined ? undefined : paged.items}
        rowKey={(follow) => follow._id}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Users className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: follows === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "name",
            header: t("columns.name"),
            cell: (follow) => (
              <a
                href={follow.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-foreground transition-colors hover:text-foreground/80"
              >
                {follow.name}
                <ExternalLink className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
              </a>
            ),
          },
          { key: "where", header: t("columns.where"), cell: (follow) => <TagLabel>{tNews(`followKinds.${follow.kind}`)}</TagLabel> },
          { key: "why", header: t("columns.why"), cell: (follow) => <span className="text-[13px] leading-relaxed text-secondary">{follow.why}</span> },
        ]}
      />
    </LearnShell>
  );
}
