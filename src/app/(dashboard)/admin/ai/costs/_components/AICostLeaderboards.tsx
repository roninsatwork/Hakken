import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Bot, Building2, TrendingUp } from "lucide-react";

import { Leaderboard } from "@/src/ui/components/screens/Leaderboard";
import type { AgentLeaderboardRow, CompanyLeaderboardRow, Translate, UserLeaderboardRow } from "./types";
import { formatUsdAmount, getAgentMessageCount } from "./costFormatters";

type AICostLeaderboardsProps = {
  adminOverview: Translate;
  topAgents?: AgentLeaderboardRow[];
  topCompanies?: CompanyLeaderboardRow[];
  topUsers?: UserLeaderboardRow[];
};

/**
 * The panel each leaderboard sits in.
 *
 * Three copies of this card sat inline, differing only in their icon, their
 * title and their animation delay. The rows inside them are `Leaderboard`'s
 * job; the card is this.
 */
function LeaderboardPanel({
  icon,
  title,
  delay,
  className = "",
  children,
}: {
  icon: ReactNode;
  title: string;
  delay: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-foreground/[0.02] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl ${className}`.trim()}
    >
      <div className="px-6 py-5 border-b border-border-dim bg-foreground/[0.03] flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-[14px] font-bold text-foreground">{title}</h2>
        </div>
      </div>
      <div className="flex flex-col p-4">{children}</div>
    </motion.section>
  );
}

export function AICostLeaderboards({ adminOverview, topAgents, topCompanies, topUsers }: AICostLeaderboardsProps) {
  const t = useTranslations("ai.costs.leaderboards");
  const empty = adminOverview("leaderboards.empty");

  return (
    <div className="flex flex-col gap-6 mt-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeaderboardPanel
          icon={<Building2 className="w-4 h-4 text-brand opacity-80" />}
          title={adminOverview("leaderboards.tenants")}
          delay={0.6}
        >
          <Leaderboard<CompanyLeaderboardRow>
            rows={topCompanies ?? []}
            rowKey={(company) => company.id}
            nameHeader={t("companyColumn")}
            name={(company) => company.name}
            avatar={{ src: (company) => company.logo, shape: "rounded" }}
            empty={empty}
            stats={[
              {
                key: "messages",
                header: t("messages"),
                cell: (company) => company.messages.toLocaleString(),
              },
              {
                key: "cost",
                header: t("cost"),
                // The token, not the raw #f43f5e this used to carry: a
                // hard-coded rose ignores the Aesthetics screen entirely.
                className: "text-destructive",
                cell: (company) => formatUsdAmount(company.cost, 4),
              },
            ]}
          />
        </LeaderboardPanel>

        <LeaderboardPanel
          icon={<TrendingUp className="w-4 h-4 text-brand opacity-80" />}
          title={adminOverview("leaderboards.initiators")}
          delay={0.7}
        >
          <Leaderboard<UserLeaderboardRow>
            rows={topUsers ?? []}
            rowKey={(user) => user.id}
            nameHeader={t("personColumn")}
            name={(user) => user.name}
            sub={(user) => user.companyName}
            avatar={{ src: (user) => user.image, shape: "circle" }}
            empty={empty}
            stats={[
              {
                key: "messages",
                header: t("messages"),
                cell: (user) => user.messages.toLocaleString(),
              },
              {
                key: "cost",
                header: t("cost"),
                className: "text-destructive",
                cell: (user) => formatUsdAmount(user.cost, 4),
              },
            ]}
          />
        </LeaderboardPanel>
      </div>

      <LeaderboardPanel
        icon={<Bot className="w-4 h-4 text-brand opacity-80" />}
        title={t("topAgents")}
        delay={0.8}
        className="w-full"
      >
        <Leaderboard<AgentLeaderboardRow>
          rows={topAgents ?? []}
          rowKey={(agent) => agent.id}
          nameHeader={t("agentColumn")}
          name={(agent) => agent.name}
          sub={() => t("autonomousProcess")}
          avatar={{ src: (agent) => agent.avatar, shape: "rounded" }}
          empty={empty}
          stats={[
            {
              key: "messages",
              header: t("messages"),
              cell: (agent) => getAgentMessageCount(agent.interactions, agent.messages).toLocaleString(),
            },
            {
              key: "cost",
              header: t("cost"),
              className: "text-destructive",
              cell: (agent) => formatUsdAmount(agent.cost, 4),
            },
          ]}
        />
      </LeaderboardPanel>
    </div>
  );
}
