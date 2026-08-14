"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Network } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";

/**
 * The map (wiki plan, phase 6): pages as dots, links as lines, drawn from
 * the rows and nothing else. Topics sit inside — they are the hubs many
 * customers touch — and customers ring the outside. Colour is decoration
 * here, never the message: every node carries its name and every kind its
 * written label, so the map reads the same to every pair of eyes.
 */

const KIND_CLASS: Record<string, string> = {
  CUSTOMER: "text-brand",
  PRODUCT: "text-info",
  POLICY: "text-warning",
  ISSUE: "text-secondary",
};

const MAX_NODES = 80;
const WIDTH = 1000;
const HEIGHT = 640;

export default function WikiMapPage() {
  const t = useTranslations("aiPages");
  const router = useRouter();
  const rows = useQuery(api.wikiPages.listCompanyPages, {});

  const layout = useMemo(() => {
    const pages = (rows ?? []).slice(0, MAX_NODES);
    const topics = pages.filter((page) => page.kind !== "CUSTOMER");
    const customers = pages.filter((page) => page.kind === "CUSTOMER");
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;

    const placeOnRing = (
      items: typeof pages,
      radiusX: number,
      radiusY: number
    ) =>
      items.map((page, index) => {
        // A lone node sits at the top; rings fill evenly, deterministically.
        const angle = (index / Math.max(items.length, 1)) * 2 * Math.PI - Math.PI / 2;
        return {
          ...page,
          x: centerX + radiusX * Math.cos(angle),
          y: centerY + radiusY * Math.sin(angle),
        };
      });

    const placedTopics = placeOnRing(topics, 170, 110);
    const placedCustomers = placeOnRing(customers, 380, 250);
    const nodes = [...placedTopics, ...placedCustomers];
    const byKey = new Map(nodes.map((node) => [`${node.kind}:${node.subjectKey}`, node]));

    const edges: Array<{ from: (typeof nodes)[number]; to: (typeof nodes)[number] }> = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      for (const link of node.links) {
        const target = byKey.get(link);
        if (!target) continue;
        const edgeKey = [node.pageId, target.pageId].sort().join("|");
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        edges.push({ from: node, to: target });
      }
    }
    return { nodes, edges };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<Network className="w-6 h-6 text-brand" />}
        title={t("map.title")}
        description={t("map.subtitle")}
        divider
      />

      <AiWorkspaceNav />

      <Link
        href="/admin/ai/pages"
        className="flex items-center gap-2 text-[13px] text-secondary hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("map.back")}
      </Link>

      {/* The legend names every kind in words; colour merely repeats it. */}
      <div className="flex flex-wrap items-center gap-4">
        {Object.entries(KIND_CLASS).map(([kind, className]) => (
          <span key={kind} className="flex items-center gap-2 text-[12px] text-secondary">
            <span className={`inline-block w-2.5 h-2.5 rounded-full bg-current ${className}`} />
            {t(`kinds.${kind}`)}
          </span>
        ))}
      </div>

      {rows !== undefined && layout.nodes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-secondary rounded-[16px] border border-border-dim bg-card/40">
          <Network className="w-6 h-6" />
          <p className="text-[13px] max-w-md text-center">{t("map.empty")}</p>
        </div>
      ) : (
        <div className="rounded-[16px] border border-border-dim bg-card/40 overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full min-w-[720px]"
            role="img"
            aria-label={t("map.title")}
          >
            <g className="text-border-dim" strokeLinecap="round">
              {layout.edges.map((edge) => (
                <line
                  key={`${edge.from.pageId}-${edge.to.pageId}`}
                  x1={edge.from.x}
                  y1={edge.from.y}
                  x2={edge.to.x}
                  y2={edge.to.y}
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              ))}
            </g>
            {layout.nodes.map((node) => (
              <g
                key={node.pageId}
                className={`${KIND_CLASS[node.kind] ?? "text-secondary"} cursor-pointer`}
                onClick={() => router.push(`/admin/ai/pages/${node.pageId}`)}
              >
                <circle cx={node.x} cy={node.y} r={9} fill="currentColor" />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={13}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                />
                <text
                  x={node.x}
                  y={node.y + 30}
                  textAnchor="middle"
                  className="fill-foreground text-[12px]"
                  style={{ fontSize: 12 }}
                >
                  {node.title.length > 22 ? `${node.title.slice(0, 21)}…` : node.title}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
