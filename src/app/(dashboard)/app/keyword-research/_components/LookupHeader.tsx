"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Plus, RefreshCw, TextSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { usePlaceIn } from "./ResearchCells";
import { CENTS_A_KEYWORD } from "./researchWords";
import { KEYWORD_RESEARCH_HREF, lookupHref, type LookupOverview } from "./useLookup";

/** "A new list…" in Add to a list: its own page, with the keyword carried over. */
const NEW_LIST = "new";

/** When a lookup was bought, as the header says it: "01/10/2026, 09:14". */
const lookedUpAt = (at: number) => formatDateTime(at, { options: { dateStyle: "short", timeStyle: "short" } });

/** The page that makes a research list, carrying a lookup's keyword, country and website to it. */
export function newListHref(lookup: LookupOverview): string {
  const query = new URLSearchParams({ keyword: lookup.keyword, country: String(lookup.locationCode), lookup: lookup.lookupId });
  if (lookup.forWebsite) query.set("site", lookup.forWebsite.siteId);
  return `/app/keyword-research/lists/new?${query.toString()}`;
}

/**
 * The header every screen of a lookup wears (board 2): the way back to
 * Keyword research, the keyword, where it was looked up and what it is
 * measured against, when it was bought and what it cost — and, for anyone
 * who may buy, the website it is measured against, Look up again and Add to
 * a list. A read-only account sees the words alone.
 */
export function LookupHeader({ lookup }: { lookup: LookupOverview }) {
  const t = useTranslations("keywordResearch.lookup");
  const router = useRouter();
  const placeIn = usePlaceIn();
  const setup = useQuery(api.keywordResearch.researchSetup, lookup.canLookUp ? {} : "skip");
  const lookUp = useMutation(api.keywordResearch.lookUp);
  const lookUpAgain = useMutation(api.keywordResearch.lookUpAgain);
  const addToList = useMutation(api.keywordResearch.addToResearchList);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-lookup" });
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const place = placeIn(lookup.locationCode, lookup.country);
  const host = lookup.forWebsite?.host ?? null;

  const status =
    lookup.state === "WAITING" ? (
      <StatusLabel tone="info" icon="working">{t("waiting")}</StatusLabel>
    ) : lookup.state === "FAILED" ? (
      <StatusLabel tone="danger">{t("failed")}</StatusLabel>
    ) : (
      <StatusLabel tone="success">
        {lookup.costUsd === null
          ? t("lookedUpWhen", { when: lookedUpAt(lookup.openedAt) })
          : t("lookedUpWhenCost", { when: lookedUpAt(lookup.openedAt), cost: `$${lookup.costUsd.toFixed(2)}` })}
      </StatusLabel>
    );

  const measureAgainst = (siteId: string) =>
    run(() => lookUp({ keywords: [lookup.keyword], locationCode: lookup.locationCode, ...(siteId ? { siteId: siteId as Id<"companyWebsites"> } : {}) }), {
      key: "measure",
      fallbackMessage: t("failedToChange"),
    });

  const addTo = async (choice: string) => {
    if (!choice) return;
    if (choice === NEW_LIST) {
      router.push(newListHref(lookup));
      return;
    }
    const list = lookup.lists.find((entry) => entry.listId === choice);
    const outcome = await run(() => addToList({ listId: choice as Id<"researchLists">, items: [{ keyword: lookup.keyword, locationCode: lookup.locationCode }] }), {
      key: "add",
      fallbackMessage: t("addFailed"),
    });
    if (outcome.ok && list) setAddedTo(list.name);
  };

  return (
    <DetailHeader
      back={{ label: t("back"), href: KEYWORD_RESEARCH_HREF }}
      icon={<TextSearch className="h-6 w-6 text-brand" />}
      title={lookup.keyword}
      description={host ? t("lookedUpIn", { place, host }) : t("lookedUpInNoWebsite", { place })}
      pills={
        <>
          {status}
          {addedTo ? <StatusLabel tone="success">{t("addedTo", { list: addedTo })}</StatusLabel> : null}
        </>
      }
      action={
        lookup.canLookUp ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t("measuredAgainst")}
              value={lookup.forWebsite?.siteId ?? ""}
              onChange={(siteId) => void measureAgainst(siteId)}
              disabled={isBusy("measure") || setup === undefined}
              className="w-[260px]"
            >
              {(setup?.websites ?? (lookup.forWebsite ? [{ siteId: lookup.forWebsite.siteId, host: lookup.forWebsite.host }] : [])).map((website) => (
                <option key={website.siteId} value={website.siteId}>{t("measuredAgainstHost", { host: website.host })}</option>
              ))}
              <option value="">{t("measuredAgainstNone")}</option>
            </Select>
            <Button
              variant="quiet"
              title={t("againTitle", { cents: CENTS_A_KEYWORD })}
              disabled={lookup.state === "WAITING" || isBusy("again")}
              onClick={() => void run(() => lookUpAgain({ lookupId: lookup.lookupId }), { key: "again", fallbackMessage: t("againFailed") })}
              className="inline-flex h-[38px] items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("again")}
            </Button>
            <Select
              aria-label={t("addToListLabel")}
              value=""
              onChange={(choice) => void addTo(choice)}
              disabled={isBusy("add")}
              chip={{ label: t("addToList"), icon: <Plus className="h-3.5 w-3.5" aria-hidden="true" /> }}
            >
              <option value="">{t("addToList")}</option>
              {lookup.lists.map((list) => (
                <option key={list.listId} value={list.listId}>{list.name}</option>
              ))}
              <option value={NEW_LIST}>{t("newList")}</option>
            </Select>
          </div>
        ) : null
      }
    />
  );
}

/**
 * "Look up another keyword…" above the lookup's menu (board 2): in the same
 * country, measured against the same website, opening the new lookup.
 */
export function LookUpAnother({ lookup }: { lookup: LookupOverview }) {
  const t = useTranslations("keywordResearch.lookup");
  const router = useRouter();
  const lookUp = useMutation(api.keywordResearch.lookUp);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-another" });
  const [text, setText] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const keyword = text.trim();
    if (!keyword || isBusy()) return;
    const outcome = await run(
      () => lookUp({ keywords: [keyword], locationCode: lookup.locationCode, ...(lookup.forWebsite ? { siteId: lookup.forWebsite.siteId } : {}) }),
      { fallbackMessage: t("anotherFailed") },
    );
    if (outcome.ok && outcome.data.lookupIds[0]) {
      setText("");
      router.push(lookupHref(outcome.data.lookupIds[0]));
    }
  };

  return (
    <form onSubmit={submit}>
      <Field
        label={t("another")}
        labelHidden
        placeholder={t("anotherPlaceholder")}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={isBusy()}
        className="h-[38px] text-[13px]"
      />
    </form>
  );
}
