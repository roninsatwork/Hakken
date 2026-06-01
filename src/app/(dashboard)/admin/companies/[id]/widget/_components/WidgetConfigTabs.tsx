import type { WidgetConfigTab } from "./types";
import { WIDGET_CONFIG_TABS } from "./widgetConfigUtils";

type WidgetConfigTabsProps = {
  activeTab: WidgetConfigTab;
  onTabChange: (tab: WidgetConfigTab) => void;
};

export function WidgetConfigTabs({ activeTab, onTabChange }: WidgetConfigTabsProps) {
  return (
    <div className="w-full lg:w-[220px] shrink-0 sticky top-6 bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl rounded-[16px] overflow-hidden flex flex-col pt-2 pb-2">
      {WIDGET_CONFIG_TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`text-left px-5 py-3.5 text-[14px] font-medium transition-colors ${
            activeTab === tab ? "bg-brand text-white" : "text-secondary hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
