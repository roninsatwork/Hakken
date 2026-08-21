import { AppWindow, MonitorSpeaker } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/atoms/Button";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDateTime } from "@/src/lib/dates";
import { WidgetPanel } from "./WidgetPanel";
import { Field } from "@/src/ui/components/screens/Field";

type WidgetIntegrationSectionProps = {
  allowedDomains: string;
  codeSnippet: string;
  copied: boolean;
  onCopy: () => void;
  setAllowedDomains: (value: string) => void;
  widgetId: string;
  kioskEnabled: boolean;
  setKioskEnabled: (value: boolean) => void;
  kioskLastSeenAt?: number;
  kioskSessionCount?: number;
};

export function WidgetIntegrationSection({
  allowedDomains,
  codeSnippet,
  copied,
  onCopy,
  setAllowedDomains,
  widgetId,
  kioskEnabled,
  setKioskEnabled,
  kioskLastSeenAt,
  kioskSessionCount,
}: WidgetIntegrationSectionProps) {
  const { platformName } = useSystemSettings();
  const t = useTranslations("ai.widget.integration");
  return (
    <WidgetPanel
      title={t("title")}
      description={t("description")}
    >
      <div className="flex flex-col gap-3">
        <Field
          label={t("domainsLabel")}
          hint={t("domainsHint")}
          value={allowedDomains}
          onChange={(event) => setAllowedDomains(event.target.value)}
          placeholder={t("domainsPlaceholder")}
          className="font-mono"
        />
      </div>

      <div className="mt-4">
        <span className="mb-3 block mt-1 text-[12px] font-medium text-secondary">
          {t("snippetLabel")}
        </span>
        <div className="bg-background border border-border-dim rounded-[12px] overflow-hidden flex flex-col relative group">
          <pre className="p-5 text-[13px] text-muted overflow-x-auto font-mono leading-relaxed select-all">
            {codeSnippet}
          </pre>
          <div className="border-t border-border-dim bg-foreground/5 py-4 px-5">
            <Button
              variant="brand"
              onClick={onCopy}
              className="px-6 py-2 rounded-[8px] flex items-center justify-center min-w-[160px]"
            >
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
        </div>
      </div>

      {/* The receptionist screen: the same widget, full screen, walk up and
          talk. Off by default — a widget must opt in to kiosk duty. */}
      <div className="mt-4 pt-6 border-t border-border-dim border-dashed">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] font-semibold text-secondary">{t("kiosk.title")}</span>
            <p className="text-[13px] text-secondary leading-relaxed">
              {t("kiosk.description")} {kioskEnabled ? t("kiosk.onHint") : t("kiosk.offHint")}
            </p>
          </div>
          {/* Raw: a toggle switch, not a button recipe. */}
          <button
            type="button"
            role="switch"
            aria-checked={kioskEnabled}
            aria-label={t("kiosk.title")}
            onClick={() => setKioskEnabled(!kioskEnabled)}
            className="mt-0.5 shrink-0"
          >
            <span
              className={`relative block h-5 w-9 rounded-full transition-colors ${kioskEnabled ? "bg-brand" : "bg-foreground/15"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${kioskEnabled ? "left-[18px]" : "left-0.5"}`}
              />
            </span>
          </button>
        </div>
        {kioskEnabled && (
          <div className="mt-4 flex flex-col gap-2">
            <a
              href={`/kiosk/${widgetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full max-w-sm py-3 rounded-full border border-border-dim text-foreground font-bold text-[13px] hover:bg-foreground/5 transition-colors"
            >
              <MonitorSpeaker className="w-4 h-4" />
              {t("kiosk.open")}
            </a>
            <p className="text-[12px] text-muted">
              {kioskLastSeenAt
                ? t("kiosk.lastSeen", { date: formatDateTime(kioskLastSeenAt), count: kioskSessionCount ?? 0 })
                : t("kiosk.notSeen")}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-6 border-t border-border-dim border-dashed">
        <p className="text-[13px] text-secondary mb-4 leading-relaxed">
          {t("sandboxHint", { platformName })}
        </p>
        <a
          href={`/sandbox/${widgetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full max-w-sm py-3 rounded-full bg-foreground text-background font-bold text-[13px] shadow-lg hover:scale-[1.02] transition-transform"
        >
          <AppWindow className="w-4 h-4" />
          {t("sandboxButton")}
        </a>
      </div>
    </WidgetPanel>
  );
}
