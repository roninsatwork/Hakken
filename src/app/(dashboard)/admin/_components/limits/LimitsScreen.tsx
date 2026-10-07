"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2, Coins, Globe, Lock } from "lucide-react";

import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { SettingRow, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { LevelsStrip, type LimitLevel } from "./LevelsStrip";
import { LIMIT_TOPICS, LIMIT_UNITS, type LimitTopic } from "./limitTopics";

/** The select's value for "use the level above's number". A real limit is never empty. */
const ABOVE = "";

type Other = { id: string; name: string; value: number };

export type LimitsScreenProps = {
  level: LimitLevel;
  /** The limits this level can set; each topic shows its own, in its own order. */
  keys: readonly string[];
  /** This level's own numbers: always one on the platform; null where a company or website uses the level above. */
  own: Record<string, number | null>;
  /** The level above's numbers, which the first choice names: the platform's on a company, the company's on a website. */
  above?: Record<string, number>;
  choices: Record<string, number[]>;
  /** Who one level down has a number of their own, per limit: companies on the platform, websites on a company. */
  others?: Record<string, Other[]>;
  otherHref?: (id: string) => string;
  /** The platform's own limits and their numbers, shown on a company's page but set only on the platform's. */
  shared?: Record<string, number>;
  companyHref?: string;
  onSave: (limits: Record<string, number | null>) => Promise<unknown>;
};

/** A limit's number as its choices say it: "1,000 keywords", "28 days", "Off". */
export function useLimitWords() {
  const t = useTranslations("admin.limits");
  return (key: string, count: number) => {
    const unit = LIMIT_UNITS[key];
    if (unit === "overviews" && count === 0) return t("off");
    return t(`units.${unit}`, { count });
  };
}

/**
 * One Limits page, the same at every level (docs/plans/active/
 * platform-limits-plan.md): the levels strip and the topic cards, the
 * platform's own limits among them. Anthony, 2026-09-28: "can you ensure the company
 * section has the same wording and options as the system settings". Only what
 * one level down needs differs: the first choice ("Use platform default (n)"
 * on a company, "Use company setting (n)" on a website, none on the platform),
 * who below has a number of their own, and the platform's own limits, which a
 * company sees but only the platform sets.
 */
export function LimitsScreen(props: LimitsScreenProps) {
  return (
    <>
      <LevelsStrip level={props.level} companyHref={props.companyHref} />
      {LIMIT_TOPICS.map((topic) => {
        const settable = topic.keys.filter((key) => props.keys.includes(key));
        if (settable.length > 0) return <TopicCard key={topic.id} topic={{ ...topic, keys: settable }} {...props} />;
        const shown = topic.keys.filter((key) => props.shared?.[key] !== undefined);
        return shown.length > 0 ? <SharedCard key={topic.id} topic={{ ...topic, keys: shown }} values={props.shared!} /> : null;
      })}
    </>
  );
}

/** One topic's limits, saved on their own, like each card on a settings screen. */
function TopicCard({ topic, level, own, above, choices, others, otherHref, onSave }: LimitsScreenProps & { topic: LimitTopic }) {
  const t = useTranslations("admin.limits");
  const named = { platformName: useSystemSettings().platformName };
  const tCommon = useTranslations("common");
  const words = useLimitWords();
  const action = useAdminAction({ scope: `admin-limits-${level}-${topic.id}` });

  // Only what was touched; everything else shows what is saved.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const stored = Object.fromEntries(topic.keys.map((key) => [key, own[key] == null ? ABOVE : String(own[key])]));
  const values = { ...stored, ...edits };
  const touched = topic.keys.filter((key) => values[key] !== stored[key]);

  const handleSave = async () => {
    setError("");
    setSaved(false);
    const limits = Object.fromEntries(touched.map((key) => [key, values[key] === ABOVE ? null : Number(values[key])]));
    const outcome = await action.run(() => onSave(limits), { suppressErrorToast: true, fallbackMessage: t("saveFailed") });
    if (outcome.ok) {
      setSaved(true);
      setEdits({});
    } else if (!outcome.deduplicated) {
      setError(outcome.message);
    }
  };

  const aboveChoice = (key: string) => {
    if (level === "platform" || above?.[key] === undefined) return null;
    return t(level === "company" ? "usePlatform" : "useCompany", { value: words(key, above[key]) });
  };
  const OtherIcon = level === "platform" ? Building2 : Globe;

  return (
    <SettingsCard title={t(`topics.${topic.id}.title`, named)}>
      <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t(`topics.${topic.id}.intro`, named)}</p>

      {topic.keys.map((key) => {
        const label = t(`fields.${key}.label`, named);
        const first = aboveChoice(key);
        return (
          <SettingRow
            key={key}
            label={label}
            description={
              <div className="flex flex-col gap-1">
                <span>{t(`fields.${key}.description`, named)}</span>
                <span className="flex items-center gap-1.5 text-secondary">
                  <Coins className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                  {t(`fields.${key}.cost`, named)}
                </span>
                {(others?.[key] ?? []).map((other) => (
                  <span key={other.id} className="flex flex-wrap items-center gap-x-1.5 text-secondary">
                    <OtherIcon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                    {otherHref
                      ? <Link href={otherHref(other.id)} className="font-medium text-brand hover:underline">{other.name}</Link>
                      : <span className="font-medium text-foreground">{other.name}</span>}
                    {t("hasOwn", { value: words(key, other.value) })}
                  </span>
                ))}
              </div>
            }
          >
            <Select
              aria-label={label}
              value={values[key]}
              onChange={(next) => {
                setEdits((before) => ({ ...before, [key]: next }));
                setSaved(false);
              }}
              className="w-full"
            >
              {first === null ? null : <option value={ABOVE}>{first}</option>}
              {(choices[key] ?? []).map((choice) => (
                <option key={choice} value={String(choice)}>{words(key, choice)}</option>
              ))}
            </Select>
          </SettingRow>
        );
      })}

      <SaveError>{error}</SaveError>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-dim pt-4">
        <p className="text-[12px] text-secondary">{t(`topics.${topic.id}.footer`, named)}</p>
        <SaveAction
          onClick={handleSave}
          isSaving={action.isBusy()}
          disabled={touched.length === 0}
          label={t("save")}
          savingLabel={tCommon("saving")}
          successLabel={t("saved")}
          showSuccess={saved}
        />
      </div>
    </SettingsCard>
  );
}

/**
 * The platform's own limits on a company's page: each is about something every
 * company shares — one AI answer, one purchase — so a company sees the number
 * and where it is set, and only System Settings → Limits changes it.
 */
function SharedCard({ topic, values }: { topic: LimitTopic; values: Record<string, number> }) {
  const t = useTranslations("admin.limits");
  const named = { platformName: useSystemSettings().platformName };
  const words = useLimitWords();
  return (
    <SettingsCard title={t(`topics.${topic.id}.title`, named)}>
      <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t(`topics.${topic.id}.intro`, named)}</p>
      {topic.keys.map((key) => (
        <SettingRow
          key={key}
          label={t(`fields.${key}.label`, named)}
          description={
            <div className="flex flex-col gap-1">
              <span>{t(`fields.${key}.description`, named)}</span>
              <span className="flex items-center gap-1.5 text-secondary">
                <Coins className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                {t(`fields.${key}.cost`, named)}
              </span>
            </div>
          }
        >
          <div className="flex h-[46px] w-full items-center justify-between gap-3 rounded-[12px] border border-dashed border-border-dim px-4 text-[14px] text-foreground">
            <span>{words(key, values[key])}</span>
            <Link href="/admin/settings/limits" className="flex items-center gap-1.5 text-[12px] text-brand hover:underline">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {t("setOnPlatform")}
            </Link>
          </div>
        </SettingRow>
      ))}
    </SettingsCard>
  );
}
