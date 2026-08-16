"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Building2, ChevronRight, Sparkles } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

/**
 * One customer.
 *
 * The top half comes from the workbook and cannot be edited here — changing a
 * customer's name means changing the spreadsheet and importing again. The
 * bottom half is typed in, lives in its own record, and survives every
 * re-import; that separation is the whole point of the screen.
 *
 * The extra figure — bedrooms or pupils — is chosen by the customer's type on
 * the server, so the form cannot offer a field the record would refuse to save.
 */

type DetailFields = {
  addressLine1: string;
  addressLine2: string;
  town: string;
  postcode: string;
  country: string;
  phone: string;
  mobile: string;
  email: string;
  accountsEmail: string;
  website: string;
  contactName: string;
  contactRole: string;
  notes: string;
  extra: string;
};

/**
 * One thing the research agent found, as the screen shows it.
 *
 * Taken from the query's own return type rather than restated, so a field added
 * to the record on the server cannot quietly go missing from the marker here.
 */
type ResearchRow = FunctionReturnType<
  typeof api.salesDataResearch.listCustomerResearch
>["applied"][number];


export default function CustomerProfilePage() {
  const t = useTranslations("salesData.customerProfile");
  const params = useParams<{ workspace: string; account: string }>();
  const workspace = params?.workspace ?? "";
  const accountNameKey = decodeURIComponent(params?.account ?? "");

  const customer = useQuery(api.salesDataCustomers.getCustomer, { accountNameKey });
  const chain = useQuery(api.salesDataCustomers.listChainMembers, { accountNameKey });
  const research = useQuery(api.salesDataResearch.listCustomerResearch, { accountNameKey });
  const groupProspects = useQuery(
    api.salesDataResearch.listGroupProspects,
    customer ? { groupName: customer.groupName } : "skip"
  );

  if (customer === undefined) {
    return (
      <>
        <Header />
        <p className="text-[13px] text-secondary">{t("loading")}</p>
      </>
    );
  }

  if (customer === null) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-foreground">{t("notFoundTitle")}</h1>
          <p className="text-[13px] text-secondary">{t("notFoundDescription")}</p>
          <Link href={`/app/${workspace}/customers`} className="text-[13px] text-brand">
            {t("back")}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <Link
            href={`/app/${workspace}/customers`}
            className="text-[13px] text-secondary hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {customer.record === "PROSPECT" ? t("backToList") : t("back")}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3 mt-2">
            <Building2 className="w-6 h-6 text-brand" />
            {customer.accountName}
            {customer.record === "PROSPECT" && (
              <span className="px-2 py-0.5 rounded-[6px] bg-brand/10 text-[11px] uppercase tracking-wide text-brand">
                {t("recordProspect")}
              </span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-[13px] text-secondary">
              {[customer.accountCode, customer.groupName, customer.customerType]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <FindDetailsButton accountNameKey={customer.accountNameKey} />
          </div>
        </div>

        {customer.prospect ? (
          <ProspectOrigin prospectKey={customer.accountNameKey} origin={customer.prospect} />
        ) : (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-foreground">{t("fromImport")}</h2>
              <span className="text-[11px] text-muted">{t("fromImportHint")}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Fact label={t("sixMonthSpend")} value={formatMoney(customer.totalRevenue)} />
              <Fact label={t("productLines")} value={customer.productCount.toLocaleString()} />
              <Fact label={t("chain")} value={customer.groupName || "—"} />
            </div>
          </Card>
        )}

        <NeedsChecking rows={research?.needsCheck ?? []} />

        <DetailsForm
          key={customer.accountNameKey}
          customer={customer}
          applied={research?.applied ?? []}
        />

        {!customer.prospect && <SalesByMonth accountNameKey={accountNameKey} />}

        {((chain && chain.length > 0) || (groupProspects && groupProspects.length > 0)) && (
          <Card>
            <h2 className="text-[15px] font-semibold text-foreground mb-3">
              {t("chainHeading", { chain: customer.groupName })}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(chain ?? []).map((sibling) => (
                <Link
                  key={sibling.accountNameKey}
                  href={`/app/${workspace}/customers/${encodeURIComponent(sibling.accountNameKey)}`}
                  className="px-3 py-1.5 rounded-[10px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:border-border transition-colors"
                >
                  {sibling.accountName}
                </Link>
              ))}
            </div>

            {/* Sites in the same group that the workspace does not supply.
                Listed rather than counted: whether nineteen Colten Care homes
                are nineteen gaps or one centrally-buying account is a
                commercial reading, and a ratio here would assert the first. */}
            {groupProspects && groupProspects.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-dim/50">
                <p className="text-[12px] text-secondary mb-2">
                  {t("groupProspects", { count: groupProspects.length })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {groupProspects.map((site) => (
                    <Link
                      key={site.prospectKey}
                      href={`/app/${workspace}/customers/${encodeURIComponent(site.prospectKey)}`}
                      className="px-3 py-1.5 rounded-[10px] border border-brand/30 text-[12px] text-brand/90 hover:text-brand hover:border-brand/60 transition-colors"
                    >
                      {site.siteName}
                      {site.town && <span className="text-muted ml-1.5">{site.town}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * The typed-in half of the profile.
 *
 * Its own component, keyed on the customer, so the form seeds itself from the
 * record when it mounts rather than being pushed values by an effect. Opening a
 * different customer remounts it; a live update to the record it is already
 * showing does not, which is what stops a save landing on top of somebody
 * mid-sentence.
 */
function DetailsForm({
  customer,
  applied,
}: {
  customer: NonNullable<FunctionReturnType<typeof api.salesDataCustomers.getCustomer>>;
  applied: ResearchRow[];
}) {
  const t = useTranslations("salesData.customerProfile");
  const save = useMutation(api.salesDataCustomers.saveCustomerDetails);
  const decide = useMutation(api.salesDataResearch.decideResearchFinding);

  const [fields, setFields] = useState<DetailFields>(() => ({
    addressLine1: customer.addressLine1 ?? "",
    addressLine2: customer.addressLine2 ?? "",
    town: customer.town ?? "",
    postcode: customer.postcode ?? "",
    country: customer.country ?? "",
    phone: customer.phone ?? "",
    mobile: customer.mobile ?? "",
    email: customer.email ?? "",
    accountsEmail: customer.accountsEmail ?? "",
    website: customer.website ?? "",
    contactName: customer.contactName ?? "",
    contactRole: customer.contactRole ?? "",
    notes: customer.notes ?? "",
    extra:
      customer.extraField === "bedrooms"
        ? (customer.bedrooms?.toString() ?? "")
        : customer.extraField === "pupils"
          ? (customer.pupils?.toString() ?? "")
          : "",
  }));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Which fields on this form the agent filled in, so each can show where its
  // value came from. Keyed by field because there is at most one applied
  // finding per field — accepting one supersedes the rest.
  const sources = new Map(applied.map((row) => [row.field, row]));
  const sourceFor = (field: string) => sources.get(field);
  const rejectSource = (field: string) => {
    const row = sources.get(field);
    if (!row) return undefined;
    return () => {
      // The box is emptied here as well as on the record. The form seeds itself
      // once and deliberately does not re-read while somebody is typing, so
      // without this the rejected value stays on screen — and the next Save
      // writes it straight back, which is the opposite of what was asked.
      setFields((current) => ({
        ...current,
        [field === customer.extraField ? "extra" : (field as keyof DetailFields)]: "",
      }));
      setStatus("idle");
      void decide({ researchId: row.id, decision: "discard" });
    };
  };

  const set =
    (field: keyof DetailFields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields((current) => ({ ...current, [field]: event.target.value }));
      setStatus("idle");
    };

  const onSave = async () => {
    const extra = fields.extra.trim() === "" ? undefined : Number(fields.extra);
    if (extra !== undefined && (!Number.isFinite(extra) || extra < 0)) {
      setStatus("error");
      setError(t("extraInvalid"));
      return;
    }

    setStatus("saving");
    setError(null);
    try {
      await save({
        accountNameKey: customer.accountNameKey,
        addressLine1: fields.addressLine1,
        addressLine2: fields.addressLine2,
        town: fields.town,
        postcode: fields.postcode,
        country: fields.country,
        phone: fields.phone,
        mobile: fields.mobile,
        email: fields.email,
        accountsEmail: fields.accountsEmail,
        website: fields.website,
        contactName: fields.contactName,
        contactRole: fields.contactRole,
        notes: fields.notes,
        ...(customer.extraField === "bedrooms" ? { bedrooms: extra } : {}),
        ...(customer.extraField === "pupils" ? { pupils: extra } : {}),
      });
      setStatus("saved");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const extraLabel =
    customer.extraField === "bedrooms"
      ? t("bedrooms")
      : customer.extraField === "pupils"
        ? t("pupils")
        : null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-foreground">{t("typedIn")}</h2>
        <span className="text-[11px] text-muted">{t("typedInHint")}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Part of the record rather than a badge on the header: what a business
            is to you belongs beside its address, and it is not something anyone
            types — it follows from whether the workbook contains them. */}
        <ReadOnlyField
          label={t("recordType")}
          value={customer.record === "PROSPECT" ? t("recordProspect") : t("recordCustomer")}
          accent={customer.record === "PROSPECT"}
        />
        <div className="hidden sm:block" />
        <Field
          label={t("addressLine1")}
          value={fields.addressLine1}
          onChange={set("addressLine1")}
          source={sourceFor("addressLine1")}
          onReject={rejectSource("addressLine1")}
        />
        <Field
          label={t("addressLine2")}
          value={fields.addressLine2}
          onChange={set("addressLine2")}
          source={sourceFor("addressLine2")}
          onReject={rejectSource("addressLine2")}
        />
        <Field
          label={t("town")}
          value={fields.town}
          onChange={set("town")}
          source={sourceFor("town")}
          onReject={rejectSource("town")}
        />
        <Field
          label={t("postcode")}
          value={fields.postcode}
          onChange={set("postcode")}
          source={sourceFor("postcode")}
          onReject={rejectSource("postcode")}
        />
        <Field
          label={t("country")}
          value={fields.country}
          onChange={set("country")}
          source={sourceFor("country")}
          onReject={rejectSource("country")}
        />
        <Field
          label={t("phone")}
          value={fields.phone}
          onChange={set("phone")}
          source={sourceFor("phone")}
          onReject={rejectSource("phone")}
        />
        <Field
          label={t("mobile")}
          value={fields.mobile}
          onChange={set("mobile")}
          source={sourceFor("mobile")}
          onReject={rejectSource("mobile")}
        />
        <Field
          label={t("email")}
          value={fields.email}
          onChange={set("email")}
          type="email"
          source={sourceFor("email")}
          onReject={rejectSource("email")}
        />
        <Field
          label={t("accountsEmail")}
          value={fields.accountsEmail}
          onChange={set("accountsEmail")}
          type="email"
          source={sourceFor("accountsEmail")}
          onReject={rejectSource("accountsEmail")}
        />
        <Field
          label={t("website")}
          value={fields.website}
          onChange={set("website")}
          type="url"
          source={sourceFor("website")}
          onReject={rejectSource("website")}
        />
        <Field
          label={t("contactName")}
          value={fields.contactName}
          onChange={set("contactName")}
          source={sourceFor("contactName")}
          onReject={rejectSource("contactName")}
        />
        <Field
          label={t("contactRole")}
          value={fields.contactRole}
          onChange={set("contactRole")}
          source={sourceFor("contactRole")}
          onReject={rejectSource("contactRole")}
        />
        {extraLabel && (
          <Field
            label={extraLabel}
            value={fields.extra}
            onChange={set("extra")}
            type="number"
            source={customer.extraField ? sourceFor(customer.extraField) : undefined}
            onReject={customer.extraField ? rejectSource(customer.extraField) : undefined}
          />
        )}
      </div>

      <div className="mt-4">
        <label className="block text-[12px] text-secondary mb-1.5">{t("notes")}</label>
        <textarea
          value={fields.notes}
          onChange={set("notes")}
          rows={3}
          className="w-full bg-background border border-border-dim rounded-[10px] px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand transition-colors"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={status === "saving"}
          className="px-4 py-2 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-60"
        >
          {status === "saving" ? t("saving") : t("save")}
        </button>
        {status === "saved" && <span className="text-[13px] text-secondary">{t("saved")}</span>}
        {status === "error" && <span className="text-[13px] text-red-400">{error}</span>}
        {customer.updatedAt && status !== "error" && (
          <span className="text-[12px] text-muted ml-auto">
            {t("lastEdited", {
              who: customer.updatedByName ?? "",
              when: new Date(customer.updatedAt).toLocaleDateString("en-GB"),
            })}
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * Sales, split by month.
 *
 * The months come from the import's period labels and the values from the six
 * period fields on each row, so nothing here is derived or apportioned. One
 * month is open at a time: its lines are a second query, so a customer with a
 * long history does not fetch every month to show one.
 */
function SalesByMonth({ accountNameKey }: { accountNameKey: string }) {
  const t = useTranslations("salesData.customerProfile");
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  const sales = useQuery(api.salesDataCustomers.listCustomerSalesByMonth, { accountNameKey });
  const lines = useQuery(
    api.salesDataCustomers.listCustomerSalesForMonth,
    openMonth === null ? "skip" : { accountNameKey, periodIndex: openMonth }
  );

  if (!sales) return null;

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-foreground">{t("salesHeading")}</h2>
        <div className="text-right">
          <span className="text-[12px] text-secondary">{t("salesTotalLabel")}</span>
          <span className="text-[18px] text-foreground ml-2 tabular-nums">
            {formatMoney(sales.total)}
          </span>
        </div>
      </div>

      {sales.months.length === 0 ? (
        <p className="text-[13px] text-secondary">{t("salesEmpty")}</p>
      ) : (
        <div className="border border-border-dim rounded-[12px] overflow-hidden">
          {sales.months.map((month) => {
            const isOpen = openMonth === month.periodIndex;
            return (
              <div key={month.periodIndex} className="border-b border-border-dim/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenMonth(isOpen ? null : month.periodIndex)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-foreground/[0.02] transition-colors"
                >
                  <span className="text-[13px] text-foreground flex items-center gap-2">
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                    {month.label}
                  </span>
                  <span className="text-[13px] text-foreground tabular-nums">
                    {formatMoney(month.total)}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 pl-9">
                    {lines === undefined ? (
                      <p className="text-[12px] text-secondary py-1">{t("loading")}</p>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[11px] uppercase tracking-[0.08em] text-muted">
                            <th className="font-medium py-1">{t("lineProduct")}</th>
                            <th className="font-medium py-1 text-right">{t("lineValue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => (
                            <tr key={line.rowId}>
                              <td className="py-1 text-[13px] text-secondary">
                                {line.productDescription}
                                <span className="block text-[11px] text-muted">
                                  {[line.productCategory, line.productType]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </td>
                              <td className="py-1 text-[13px] text-secondary text-right tabular-nums align-top">
                                {formatMoney(line.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sales.months.length > 0 && (
        <p className="text-[11px] text-muted mt-2">{t("salesMonthsNote")}</p>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-sidebar/40 border border-border-dim rounded-[20px] backdrop-blur-xl p-5">
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-secondary">{label}</p>
      <p className="text-[15px] text-foreground mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

/**
 * A field the record holds but nobody edits.
 *
 * Whether a business is a customer or a prospect is not a preference — it
 * follows from whether the imported workbook contains them, and it changes by
 * itself the month they start buying. Rendered as a field rather than a label
 * so it reads as part of the record, and rendered without an input so it is
 * plain that it cannot be set by hand.
 */
function ReadOnlyField({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] text-secondary mb-1.5">{label}</label>
      <div
        className={`w-full bg-background/40 border border-border-dim/60 rounded-[10px] px-3 py-2 text-[13px] ${
          accent ? "text-brand" : "text-secondary"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  source,
  onReject,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  /** Set when this value was found rather than typed. */
  source?: ResearchRow;
  onReject?: () => void;
}) {
  return (
    <div>
      <label className="block text-[12px] text-secondary mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="w-full bg-background border border-border-dim rounded-[10px] px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand transition-colors"
      />
      {source && <SourceMarker source={source} onReject={onReject} />}
    </div>
  );
}

/**
 * Where a prospect came from, in place of the spreadsheet card.
 *
 * A prospect has no import behind it and no spend, so the panel a customer uses
 * for those carries its provenance instead: the page that listed it, the
 * agent's own line about why it belongs to the group, and the way out.
 */
function ProspectOrigin({
  prospectKey,
  origin,
}: {
  prospectKey: string;
  origin: NonNullable<
    NonNullable<FunctionReturnType<typeof api.salesDataCustomers.getCustomer>>["prospect"]
  >;
}) {
  const t = useTranslations("salesData.customerProfile");
  const dismiss = useMutation(api.salesDataResearch.dismissProspect);
  const [dismissing, setDismissing] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-foreground">{t("prospectFound")}</h2>
        {origin.status === "NEW" && (
          <button
            type="button"
            disabled={dismissing}
            onClick={() => {
              setDismissing(true);
              void dismiss({ prospectKey }).finally(() => setDismissing(false));
            }}
            className="px-3 py-1.5 rounded-[10px] border border-border-dim text-[12px] text-secondary hover:text-red-400 hover:border-border transition-colors disabled:opacity-60"
          >
            {t("notInterested")}
          </button>
        )}
      </div>

      {origin.reasoning && <p className="text-[13px] text-secondary">{origin.reasoning}</p>}

      {origin.sourceUrl && (
        <p className="text-[11px] text-muted mt-2 flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-brand shrink-0" />
          <a
            href={origin.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary hover:text-brand transition-colors"
          >
            {origin.sourceName ?? origin.sourceUrl}
          </a>
          <span>{new Date(origin.foundAt).toLocaleDateString("en-GB")}</span>
        </p>
      )}

      {/* A name that reads like an existing customer at a different postcode.
          Shown rather than resolved: the software cannot know which of the two
          it is, and guessing wrong reaches a customer by telephone. */}
      {origin.conflictNote && (
        <p className="mt-4 rounded-[10px] border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
          {origin.conflictNote}
        </p>
      )}

      {origin.status === "DISMISSED" && (
        <p className="mt-4 text-[12px] text-muted">{t("prospectDismissed")}</p>
      )}
    </Card>
  );
}

/**
 * Send the research agent at this one customer.
 *
 * It reports that the job started and stops there. The run itself takes half a
 * minute or so and its results arrive on this screen as they are written, so
 * claiming anything more would be claiming to know how it went.
 */
function FindDetailsButton({ accountNameKey }: { accountNameKey: string }) {
  const t = useTranslations("salesData.customerProfile");
  const start = useMutation(api.salesDataResearch.startCustomerResearch);
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onClick = async () => {
    setState("starting");
    setMessage(null);
    try {
      await start({ accountNameKey });
      setState("started");
      setMessage(t("findDetailsStarted"));
    } catch (caught) {
      setState("error");
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "starting"}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:border-border transition-colors disabled:opacity-60"
      >
        <Sparkles className="w-3.5 h-3.5 text-brand" />
        {state === "starting" ? t("findDetailsStarting") : t("findDetails")}
      </button>
      {message && (
        <span className={`text-[12px] ${state === "error" ? "text-red-400" : "text-secondary"}`}>
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * Where a researched value came from.
 *
 * Shown only under values the agent found. A typed-in value carries no marker,
 * so the absence of one is itself the answer to "did a person put this here?".
 * The link is the whole point: a value nobody can check is worse than a blank.
 */
function SourceMarker({ source, onReject }: { source: ResearchRow; onReject?: () => void }) {
  const t = useTranslations("salesData.customerProfile");

  return (
    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
      <Sparkles className="w-3 h-3 text-brand shrink-0" />
      {source.sourceUrl ? (
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-secondary hover:text-brand transition-colors truncate"
          title={source.sourceUrl}
        >
          {source.sourceName ?? source.sourceUrl}
        </a>
      ) : (
        <span className="text-secondary">{source.sourceName ?? ""}</span>
      )}
      <span className="shrink-0">{new Date(source.foundAt).toLocaleDateString("en-GB")}</span>
      {onReject && (
        <button
          type="button"
          onClick={onReject}
          className="ml-auto shrink-0 text-secondary hover:text-red-400 transition-colors"
        >
          {t("notRight")}
        </button>
      )}
    </div>
  );
}

/**
 * Findings waiting for a person.
 *
 * Everything the agent was not certain of, and everything that contradicted a
 * value already on the record. Sits above the details because it is the thing
 * to deal with before reading anything below it — and because a queue nobody
 * sees is a queue nobody works.
 */
function NeedsChecking({
  rows,
}: {
  rows: ResearchRow[];
}) {
  const t = useTranslations("salesData.customerProfile");
  const decide = useMutation(api.salesDataResearch.decideResearchFinding);
  const [busy, setBusy] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const onDecide = async (researchId: ResearchRow["id"], decision: "accept" | "discard") => {
    setBusy(researchId);
    try {
      await decide({ researchId, decision });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-foreground">
          {t("needsChecking", { count: rows.length })}
        </h2>
        <span className="text-[11px] text-muted">{t("needsCheckingHint")}</span>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-[10px] border border-border-dim bg-background px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] text-secondary">{t(row.field)}</span>
                <span className="text-[13px] text-foreground truncate">{row.value}</span>
              </div>
              {row.reasoning && (
                <p className="text-[11px] text-muted mt-0.5 truncate" title={row.reasoning}>
                  {row.reasoning}
                </p>
              )}
              <SourceMarker source={row} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => onDecide(row.id, "accept")}
                className="px-3 py-1.5 rounded-[8px] bg-brand text-white text-[12px] font-medium disabled:opacity-60"
              >
                {t("useIt")}
              </button>
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => onDecide(row.id, "discard")}
                className="px-3 py-1.5 rounded-[8px] border border-border-dim text-secondary text-[12px] hover:text-foreground transition-colors disabled:opacity-60"
              >
                {t("discard")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  });
}
