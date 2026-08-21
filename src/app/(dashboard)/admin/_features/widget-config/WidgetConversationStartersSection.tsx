import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { canAddConversationStarter } from "./widgetConfigUtils";
import { WidgetPanel } from "./WidgetPanel";
import { Field } from "@/src/ui/components/screens/Field";

type WidgetConversationStartersSectionProps = {
  conversationStarters: string[];
  onAddStarter: () => void;
  onRemoveStarter: (index: number) => void;
  setStarterInput: (value: string) => void;
  starterInput: string;
};

export function WidgetConversationStartersSection({
  conversationStarters,
  onAddStarter,
  onRemoveStarter,
  setStarterInput,
  starterInput,
}: WidgetConversationStartersSectionProps) {
  const t = useTranslations("ai.widget.starters");
  const canAddStarter = canAddConversationStarter(starterInput, conversationStarters);

  return (
    <WidgetPanel
      title={t("title")}
      description={t("description")}
    >
      <div className="flex flex-col gap-4 bg-background/50 p-6 rounded-[16px] border border-border-dim">
        <div className="flex items-center gap-2">
          {/* The panel's own heading already names this box, so the label is
              kept for anyone listening rather than repeated on screen. */}
          <div className="flex-1">
            <Field
              label={t("addLabel")}
              labelHidden
              value={starterInput}
              onChange={(event) => setStarterInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onAddStarter()}
              disabled={conversationStarters.length >= 4}
              placeholder={t("inputPlaceholder")}
              className="disabled:opacity-50"
            />
          </div>
          <span className="text-[12px] text-muted font-medium w-12 text-right">
            {t("count", { count: conversationStarters.length })}
          </span>
        </div>
        {/* Raw: foreground/10 filled chip — no variant carries that fill. */}
        <button
          onClick={onAddStarter}
          disabled={!canAddStarter}
          className="self-start px-5 py-2.5 rounded-[10px] bg-foreground/10 text-foreground font-medium text-[13px] transition-colors hover:bg-foreground/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> {t("addButton")}
        </button>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        {conversationStarters.length === 0 ? (
          <p className="text-[14px] text-foreground font-medium text-center py-12">
            {t("empty")}
          </p>
        ) : (
          conversationStarters.map((starter, index) => (
            <div
              key={`${starter}-${index}`}
              className="flex items-center justify-between bg-background border border-border-dim p-4 rounded-[12px] text-[14px] text-foreground tracking-wide group"
            >
              {starter}
              {/* Raw: hover-revealed red remove dot — its colours and reveal match no variant. */}
              <button
                onClick={() => onRemoveStarter(index)}
                className="w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </WidgetPanel>
  );
}
