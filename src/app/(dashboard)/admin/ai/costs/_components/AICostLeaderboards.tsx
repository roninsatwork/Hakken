import Image from "next/image";
import { motion } from "framer-motion";
import { Bot, Building2, TrendingUp } from "lucide-react";
import type { AgentLeaderboardRow, CompanyLeaderboardRow, Translate, UserLeaderboardRow } from "./types";
import { formatUsdAmount, getAgentMessageCount } from "./costFormatters";

type AICostLeaderboardsProps = {
  adminOverview: Translate;
  topAgents?: AgentLeaderboardRow[];
  topCompanies?: CompanyLeaderboardRow[];
  topUsers?: UserLeaderboardRow[];
};

export function AICostLeaderboards({ adminOverview, topAgents, topCompanies, topUsers }: AICostLeaderboardsProps) {
  return (
    <div className="flex flex-col gap-6 mt-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
        >
          <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-[#10b981] opacity-80" />
              <h2 className="text-[14px] font-bold text-foreground">{adminOverview("leaderboards.tenants")}</h2>
            </div>
          </div>
          <div className="flex flex-col">
            {!topCompanies || topCompanies.length === 0 ? (
              <LeaderboardEmptyState label={adminOverview("leaderboards.empty")} />
            ) : (
              topCompanies.map((company, index) => (
                <div
                  key={company.id}
                  className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-[14px] font-mono font-bold text-muted/40 w-5">#{index + 1}</span>
                    {company.logo ? (
                      <Image
                        src={company.logo}
                        alt={company.name}
                        width={32}
                        height={32}
                        unoptimized
                        className="w-8 h-8 rounded-[8px] object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d]"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-[8px] bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] flex items-center justify-center text-[10px] text-foreground font-bold">
                        {company.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[13px] font-semibold tracking-wide text-foreground">{company.name}</span>
                  </div>
                  <LeaderboardStats cost={company.cost} messages={company.messages} />
                </div>
              ))
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
        >
          <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-brand opacity-80" />
              <h2 className="text-[14px] font-bold text-foreground">{adminOverview("leaderboards.initiators")}</h2>
            </div>
          </div>
          <div className="flex flex-col">
            {!topUsers || topUsers.length === 0 ? (
              <LeaderboardEmptyState label={adminOverview("leaderboards.empty")} />
            ) : (
              topUsers.map((user, index) => (
                <div
                  key={user.id}
                  className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                    <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{index + 1}</span>
                    <Image
                      src={user.image}
                      alt={user.name}
                      width={32}
                      height={32}
                      unoptimized
                      className="w-8 h-8 rounded-full object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">
                        {user.name}
                      </span>
                      <span className="text-[10px] text-secondary/70 tracking-wide truncate">{user.companyName}</span>
                    </div>
                  </div>
                  <LeaderboardStats cost={user.cost} messages={user.messages} />
                </div>
              ))
            )}
          </div>
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl w-full"
      >
        <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <Bot className="w-4 h-4 text-brand opacity-80" />
            <h2 className="text-[14px] font-bold text-foreground">Top Agents By Compute</h2>
          </div>
        </div>
        <div className="flex flex-col">
          {!topAgents || topAgents.length === 0 ? (
            <LeaderboardEmptyState label={adminOverview("leaderboards.empty")} />
          ) : (
            topAgents.map((agent, index) => (
              <div
                key={agent.id}
                className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors"
              >
                <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                  <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{index + 1}</span>
                  <Image
                    src={agent.avatar}
                    alt={agent.name}
                    width={32}
                    height={32}
                    unoptimized
                    className="w-8 h-8 rounded-[6px] object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">
                      {agent.name}
                    </span>
                    <span className="text-[10px] text-secondary/70 tracking-wide truncate">Autonomous Process</span>
                  </div>
                </div>
                <LeaderboardStats cost={agent.cost} messages={getAgentMessageCount(agent.interactions, agent.messages)} />
              </div>
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}

function LeaderboardEmptyState({ label }: { label: string }) {
  return <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{label}</div>;
}

function LeaderboardStats({ cost, messages }: { cost: number; messages: number }) {
  return (
    <div className="flex items-center gap-6 shrink-0 pr-2">
      <div className="flex flex-col items-end min-w-[65px]">
        <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
        <span className="text-[13px] font-bold text-foreground tracking-tight">{messages.toLocaleString()}</span>
      </div>
      <div className="flex flex-col items-end min-w-[65px]">
        <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
        <span className="text-[13px] font-bold text-[#f43f5e] tracking-tight">{formatUsdAmount(cost, 4)}</span>
      </div>
    </div>
  );
}
