"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TableEmptyRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { cn } from "@/src/ui/lib/utils";
import { useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, CircleCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

type AreaState = "NEEDS_ATTENTION" | "SET_HERE" | "NOT_CONFIGURED";

type Area = {
  key: string;
  label: string;
  state: AreaState;
  summary: string;
  action?: string;
  href: string;
};

/**
 * Needs attention first, then what this company has set, then what it inherits.
 *
 * Order carries the priority. The screen this replaces sorted the same items
 * into NEEDS WORK / HEALTHY / QUIET columns and filed a Skills or Activity tile
 * under QUIET *by name* while still ranking it in the top three things to fix —
 * a low-attention column and a high-attention ranking for one state.
 */
const STATE_ORDER: Record<AreaState, number> = {
  NEEDS_ATTENTION: 0,
  SET_HERE: 1,
  NOT_CONFIGURED: 2,
};

function getStateLabel(state: AreaState) {
  if (state === "NEEDS_ATTENTION") return "Needs attention";
  if (state === "SET_HERE") return "Set for this company";
  return "Not configured";
}

// Only the state that needs acting on is coloured. "Not configured" is the
// normal state for most companies and is not a warning, so it is not amber.
function getStateClassName(state: AreaState) {
  if (state === "NEEDS_ATTENTION") return "text-[#f59e0b]";
  if (state === "SET_HERE") return "text-foreground";
  return "text-muted";
}

export default function CompanyAiOverviewPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const readiness = useQuery(api.companyReadiness.getCompanyAiReadiness, { companyId });

  const areas = (readiness?.areas ?? []) as Area[];
  const sortedAreas = [...areas].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
  const needsAttention = sortedAreas.filter((area) => area.state === "NEEDS_ATTENTION");
  const isReady = readiness !== undefined && readiness.state === "READY";

  const linkTo = (href: string) => `/admin/companies/${companyId}${href}`;

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <PageHeader
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title="Company AI"
        description="What this company has set up of its own, and whether any of it needs attention."
      />

      {readiness && (
        <>
          <div
            className={cn(
              "flex items-center gap-3 rounded-[10px] border px-4 py-3",
              isReady
                ? "border-[#10b981]/20 bg-[#10b981]/10"
                : "border-[#f59e0b]/20 bg-[#f59e0b]/10"
            )}
          >
            {isReady ? (
              <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[#10b981]" />
            ) : (
              <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
            )}
            <span className={cn("text-[15px] font-semibold", isReady ? "text-[#10b981]" : "text-[#f59e0b]")}>
              {isReady ? "Ready" : "Needs attention"}
            </span>
            {/* Taken from the list below, so the headline and the table cannot
                disagree. The old screen took its percentage from five areas and
                its reasons from nine, which is why it argued with itself. */}
            <span className={cn("text-[14px]", isReady ? "text-[#10b981]" : "text-[#f59e0b]")}>
              {isReady
                ? "· nothing needs attention"
                : `· ${readiness.needsAttentionCount} of ${areas.length} areas`}
            </span>
          </div>

          <p className="text-[13px] leading-relaxed text-secondary">
            A company does not have to set any of this up — anything left alone uses the platform&apos;s
            setup, which is normal and does not hold up a launch. Only something set here that
            does not work needs attention.
          </p>
        </>
      )}

      {needsAttention.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">Fix these first</h2>
          {needsAttention.map((area) => (
            <Link
              key={area.key}
              href={linkTo(area.href)}
              className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
            >
              <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">{area.label}</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-secondary">{area.summary}</div>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                {area.action}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      <TableShell minWidthClassName="min-w-[720px]">
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="w-[24%] px-4 py-3 font-medium">Area</th>
            <th className="w-[47%] px-4 py-3 font-medium">What this company has</th>
            <th className="w-[29%] px-4 py-3 font-medium">State</th>
          </tr>
        </thead>
        <tbody>
          {readiness === undefined ? (
            <TableLoadingRow colSpan={3} />
          ) : sortedAreas.length === 0 ? (
            <TableEmptyRow
              colSpan={3}
              icon={<Sparkles className="h-8 w-8 text-muted/30" />}
              label="Nothing to report yet"
            />
          ) : (
            sortedAreas.map((area) => (
              <tr key={area.key} className="border-b border-border-dim/50">
                <td className="px-4 py-3 align-top">
                  <Link
                    href={linkTo(area.href)}
                    className="text-[13px] text-foreground transition-colors hover:text-brand"
                  >
                    {area.label}
                  </Link>
                </td>
                <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-secondary">
                  {area.summary}
                </td>
                <td className={cn("px-4 py-3 align-top text-[13px]", getStateClassName(area.state))}>
                  {getStateLabel(area.state)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
