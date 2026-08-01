"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Building2, ChevronRight } from "lucide-react";
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
  contactName: string;
  contactRole: string;
  notes: string;
  extra: string;
};


export default function CustomerProfilePage() {
  const t = useTranslations("salesData.customerProfile");
  const params = useParams<{ workspace: string; account: string }>();
  const workspace = params?.workspace ?? "";
  const accountNameKey = decodeURIComponent(params?.account ?? "");

  const customer = useQuery(api.salesDataCustomers.getCustomer, { accountNameKey });
  const chain = useQuery(api.salesDataCustomers.listChainMembers, { accountNameKey });

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
            {t("back")}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3 mt-2">
            <Building2 className="w-6 h-6 text-brand" />
            {customer.accountName}
          </h1>
          <p className="text-[13px] text-secondary mt-1">
            {[customer.accountCode, customer.groupName, customer.customerType]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

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

        <DetailsForm key={customer.accountNameKey} customer={customer} />

        <SalesByMonth accountNameKey={accountNameKey} />

        {chain && chain.length > 0 && (
          <Card>
            <h2 className="text-[15px] font-semibold text-foreground mb-3">
              {t("chainHeading", { chain: customer.groupName })}
            </h2>
            <div className="flex flex-wrap gap-2">
              {chain.map((sibling) => (
                <Link
                  key={sibling.accountNameKey}
                  href={`/app/${workspace}/customers/${encodeURIComponent(sibling.accountNameKey)}`}
                  className="px-3 py-1.5 rounded-[10px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:border-border transition-colors"
                >
                  {sibling.accountName}
                </Link>
              ))}
            </div>
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
}: {
  customer: NonNullable<FunctionReturnType<typeof api.salesDataCustomers.getCustomer>>;
}) {
  const t = useTranslations("salesData.customerProfile");
  const save = useMutation(api.salesDataCustomers.saveCustomerDetails);

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
        <Field label={t("addressLine1")} value={fields.addressLine1} onChange={set("addressLine1")} />
        <Field label={t("addressLine2")} value={fields.addressLine2} onChange={set("addressLine2")} />
        <Field label={t("town")} value={fields.town} onChange={set("town")} />
        <Field label={t("postcode")} value={fields.postcode} onChange={set("postcode")} />
        <Field label={t("country")} value={fields.country} onChange={set("country")} />
        <Field label={t("phone")} value={fields.phone} onChange={set("phone")} />
        <Field label={t("mobile")} value={fields.mobile} onChange={set("mobile")} />
        <Field label={t("email")} value={fields.email} onChange={set("email")} type="email" />
        <Field
          label={t("accountsEmail")}
          value={fields.accountsEmail}
          onChange={set("accountsEmail")}
          type="email"
        />
        <Field label={t("contactName")} value={fields.contactName} onChange={set("contactName")} />
        <Field label={t("contactRole")} value={fields.contactRole} onChange={set("contactRole")} />
        {extraLabel && (
          <Field label={extraLabel} value={fields.extra} onChange={set("extra")} type="number" />
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
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
    </div>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  });
}
