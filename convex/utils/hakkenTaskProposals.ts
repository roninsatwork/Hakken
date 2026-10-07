import type { Infer } from "convex/values";
import type { hakkenTaskProposalValidator } from "../hakkenTaskSchema";

/**
 * The change a run proposed, for its reply (docs/plans/active/
 * hakken-tasks-plan.md, item 1.2): read from the run's own record of its tool
 * calls when the reply is saved, as its "Looked up" line is — the last one
 * that worked, so asking again replaces it. Plain code, free of any Convex
 * function.
 */

export type TaskProposal = Infer<typeof hakkenTaskProposalValidator>;

const PROPOSING = new Set([
  "assistant.tasks.propose",
  "assistant.tasks.proposeReport",
  "assistant.tasks.proposeAnswerAlert",
  "assistant.tasks.proposeRankingAlert",
  "assistant.tasks.proposeResearch",
  "assistant.tasks.change",
]);
const ACTIONS = new Set(["CREATE", "PAUSE", "RESUME", "DELETE", "RESEARCH"]);

export function proposalFromToolCalls(calls: ReadonlyArray<{ handlerMapping: string; status: string; resultJson?: string }>): TaskProposal | undefined {
  let found: TaskProposal | undefined;
  for (const call of calls) {
    if (!PROPOSING.has(call.handlerMapping) || call.status !== "SUCCESS" || !call.resultJson) continue;
    try {
      // The runtime wraps a handler's answer as { status, data }.
      const data = (JSON.parse(call.resultJson) as { data?: { ok?: boolean; proposal?: TaskProposal } }).data;
      const proposal = data?.ok ? data.proposal : undefined;
      if (proposal && ACTIONS.has(proposal.action) && typeof proposal.title === "string") found = { ...proposal, status: "PENDING" };
    } catch {
      // A result that is not JSON proposed nothing.
    }
  }
  return found;
}
