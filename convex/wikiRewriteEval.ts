"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import {
  buildRewriteSystemInstruction,
  buildRewriteUserContent,
  validateRewrittenPage,
} from "./wikiRewriteService";

/**
 * The wiki plan's acceptance 1, runnable: "improvement is judged, not
 * assumed." Each fixture is a page, an event, and what a correct rewrite
 * must and must not contain; a judge model then grades the rewrite against
 * the rubric. Run on a deployment with models configured:
 *
 *   npx convex run wikiRewriteEval:runFixtures
 *
 * Returns one verdict per fixture; every fixture must pass for the loop to
 * count as working. Mechanical seatbelts (revisions, pinned survival,
 * tenant walls) are proven separately in wikiPages.test.ts.
 */

const FIXTURES = [
  {
    name: "a changed fact is replaced, not accumulated",
    title: "acme-hotels",
    currentContent:
      "Prefers email over phone. Mid-refurbishment: 12 rooms out of service until September. " +
      "Asked twice about bulk linen pricing; quoted the standard rate in July.",
    pinnedCorrections: [],
    eventLabel: "phone call",
    eventText:
      "Summary: The refurbishment has finished early and all rooms are back in service. " +
      "They now want the winter-season linen contract discussed with pricing.\n\n" +
      "Transcript:\nCaller: Good news, the refurb wrapped up last week, everything's open again.\n" +
      "Assistant: Wonderful — shall I have the team call about the winter contract?\n" +
      "Caller: Yes please, and they should bring the pricing this time.",
    mustMention: ["winter", "refurbishment finished OR rooms back in service"],
    mustNotMention: ["12 rooms out of service"],
  },
  {
    name: "a pinned correction is respected and not contradicted",
    title: "brightwater-school",
    currentContent: "Contact is the bursar. Interested in the sports hall flooring range.",
    pinnedCorrections: [
      { text: "Invoices must go to the county office, never to the school directly.", pinnedAt: 1 },
    ],
    eventLabel: "email exchange",
    eventText:
      "Subject: Invoice\n\nThey wrote: Please send the invoice straight over to us at the school office.\n\n" +
      "Assistant replied: Of course — the team will arrange the invoice.",
    mustMention: [],
    mustNotMention: ["invoice will be sent to the school directly"],
  },
] as const;

type FixtureVerdict = {
  fixture: string;
  pass: boolean;
  judge: string;
  rewrittenChars: number;
};

export const runFixtures = internalAction({
  args: {},
  handler: async (ctx): Promise<FixtureVerdict[]> => {
    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "fast-chat",
    });
    const verdicts: FixtureVerdict[] = [];

    for (const fixture of FIXTURES) {
      const rewriteResponse = await generateTextWithResolvedModel({
        model,
        systemInstruction: buildRewriteSystemInstruction(),
        contents: [
          {
            type: "text",
            text: buildRewriteUserContent({
              title: fixture.title,
              currentContent: fixture.currentContent,
              pinnedCorrections: [...fixture.pinnedCorrections],
              eventLabel: fixture.eventLabel,
              eventText: fixture.eventText,
            }),
          },
        ],
      });
      const verdict = validateRewrittenPage(rewriteResponse.text ?? "");
      if (!verdict.ok) {
        verdicts.push({ fixture: fixture.name, pass: false, judge: `refused: ${verdict.reason}`, rewrittenChars: 0 });
        continue;
      }

      const judgeResponse = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          "You grade a rewritten customer-wiki page against a rubric. Reply with PASS or FAIL on the first line, then one sentence why.",
        contents: [
          {
            type: "text",
            text:
              `Old page:\n${fixture.currentContent}\n\n` +
              `Event that happened:\n${fixture.eventText}\n\n` +
              `Rewritten page:\n${verdict.content}\n\n` +
              `Rubric — every point must hold:\n` +
              `1. Accurate to the event; nothing invented.\n` +
              `2. Facts the event changed are replaced — the stale version must be gone, and no fact appears twice.\n` +
              `3. Must reflect: ${fixture.mustMention.join("; ") || "(nothing specific)"}.\n` +
              `4. Must NOT state: ${fixture.mustNotMention.join("; ") || "(nothing specific)"}.\n` +
              `5. Reads as a short plain briefing note, no longer than it needs to be.`,
          },
        ],
      });
      const judge = judgeResponse.text?.trim() ?? "";
      verdicts.push({
        fixture: fixture.name,
        pass: judge.toUpperCase().startsWith("PASS"),
        judge,
        rewrittenChars: verdict.content.length,
      });
    }
    return verdicts;
  },
});
