"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { Database, Trash2 } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useRouter } from "next/navigation";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Image from "next/image";
import type { DeletingProperty } from "./ScrapedDataDeleteDialog";

const loadDeleteDialog = () => import("./ScrapedDataDeleteDialog");
const ScrapedDataDeleteDialog = dynamic(loadDeleteDialog);

export default function ScrapedDataPage() {
  const t = useTranslations('sidebar');
  const tPage = useTranslations('properties.scrapedData');
  const router = useRouter();
  const [deletingProperty, setDeletingProperty] = useState<DeletingProperty | null>(null);
  const deleteProperty = useMutation(api.properties.deleteProperty);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const { results, status, loadMore } = usePaginatedQuery(
    api.properties.listProperties,
    { searchTerm },
    { initialNumItems: 15 }
  );

  const propertiesCount = useQuery(api.properties.getPropertiesCount, { searchTerm }) || 0;
  const totalItems = Math.max(results.length, propertiesCount);
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const paginatedItems = results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  /**
   * One handler for both directions, because the shared footer asks for a page
   * rather than a step. It still fetches the next slice when moving past what
   * has been loaded, which is the only thing the two old handlers did that a
   * plain setState would not.
   */
  const handlePageChange = (nextPage: number) => {
    const target = Math.min(Math.max(nextPage, 1), totalPages);
    setCurrentPage(target);
    if (target * itemsPerPage > results.length && status === "CanLoadMore") {
      loadMore(15);
    }
  };

  const confirmDelete = async () => {
    if (deletingProperty) {
      await deleteProperty({ id: deletingProperty._id });
      setDeletingProperty(null);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader
          icon={<Database className="w-6 h-6 text-brand" />}
          title={t('propertiesScrapedData')}
          description={tPage('pageDescription')}
        />


        <DataTable
          rows={status === "LoadingFirstPage" ? undefined : paginatedItems}
          rowKey={(property) => property._id}
          minWidthClassName="min-w-[860px]"
          search={{
            value: searchTerm,
            onChange: (value) => {
              setSearchTerm(value);
              setCurrentPage(1);
            },
            placeholder: tPage('searchPlaceholder'),
          }}
          empty={{
            icon: <Database className="w-8 h-8 text-muted/30" />,
            label: tPage('emptyLabel'),
            action: (
              <p className="text-[13px] text-secondary">
                {searchTerm.length > 0
                  ? tPage('emptyNoMatch')
                  : tPage('emptyNone')}
              </p>
            ),
          }}
          footer={{
            mode: "paged",
            page: currentPage,
            totalPages,
            totalCount: totalItems,
            pageSize: itemsPerPage,
            isLoading: status === "LoadingMore" || status === "LoadingFirstPage",
            onPageChange: handlePageChange,
            labels: {
              empty: tPage('emptyLabel'),
              showing: (start, end, total) =>
                tPage('showing', { start, end, total }),
            },
          }}
          columns={[
            {
              key: "address",
              header: tPage('columnAddress'),
              className: "w-[40%]",
              cell: (property) => (
                <div className="flex items-center gap-4">
                  {property.imageUrl ? (
                    <Image src={property.imageUrl} alt={tPage('imageAlt')} width={48} height={48} unoptimized className="w-12 h-12 rounded-[8px] object-cover border border-border-dim" />
                  ) : (
                    <div className="w-12 h-12 rounded-[8px] bg-background border border-border-dim flex items-center justify-center">
                      <span className="text-[9px] font-mono text-muted uppercase">{tPage('noImage')}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-[13px] text-foreground block line-clamp-1">
                      {property.address}
                    </span>
                    <span className="text-[12px] text-secondary block mt-0.5">
                      {property.propertyType} • {property.agentName}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              key: "price",
              header: tPage('columnPrice'),
              cell: (property) => (
                <span className="text-[13px] font-medium text-brand">
                  {property.price ? `£${property.price.toLocaleString()}` : "POA"}
                </span>
              ),
            },
            {
              key: "specs",
              header: tPage('columnSpecs'),
              cell: (property) => (
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 rounded bg-background border border-border-dim text-[11px] text-secondary">
                    {tPage('beds', { count: property.bedrooms ?? 0 })}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-background border border-border-dim text-[11px] text-secondary">
                    {tPage('baths', { count: property.bathrooms ?? 0 })}
                  </span>
                </div>
              ),
            },
            {
              key: "actions",
              header: tPage('columnActions'),
              align: "right",
              /* Not RowActions: these two are always visible here rather than
                 appearing on hover, and "View details" is a labelled button
                 rather than an icon. Only the delete moves onto the kit, which
                 is what gives a read-only reader the list without the bin. */
              cell: (property) => (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => router.push(`/app/properties/scraped-data/${property._id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-brand/10 text-brand text-[12px] font-medium hover:bg-brand/20 transition-colors"
                  >
                    {tPage('viewDetails')}
                  </button>
                  <RowIconButton
                    onClick={() => {
                      void loadDeleteDialog();
                      setDeletingProperty(property);
                    }}
                    tone="danger"
                    label={tPage('deleteRow', { address: property.address })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </RowIconButton>
                </div>
              ),
            },
          ]}
        />
      </div>

      {deletingProperty ? (
        <ScrapedDataDeleteDialog
          property={deletingProperty}
          onClose={() => setDeletingProperty(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
