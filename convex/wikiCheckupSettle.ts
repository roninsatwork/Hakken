"use node";

import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import {
  WIKI_PAGE_MAX_CHARS,
  changedSentences,
  linkKeyFor,
  relevantPassages,
  subjectWords,
  validateRewrittenPage,
} from "./wikiRewriteService";
import {
  buildSourcesDisagreeNote,
  describeSettlingRule,
  parseJsonObject,
  settleDisagreement,
  type SettlingSide,
  type WikiCheckupFound,
  type WikiCheckupStepKey,
} from "./wikiCheckupRules";

/**
 * The daily check-up's shared hands (wiki-daily-checkup-plan.md): the step
 * context, the one way the check-up asks the model (written into the same
 * cost ledger as every other agent), moving the progress bar, settling a
 * disputed fact by the rules, bringing a page back in line with its sources,
 * following changed and removed files, and the web search for gaps.
 *
 * The model only ever reports facts here — which sources state which claim,
 * whether a disagreement is real. The rules in wikiCheckupRules.ts decide.
 */

export type Scope = Id<"companies"> | undefined;
export type StepState = {
  /** Work planned per step (and page counts), set once when the run starts. */
  plan?: Record<string, number>;
  /** Work done so far in the current step, across continuations. */
  stepDone?: number;
  /** A step's own progress marker between continuations. */
  marker?: number;
};
export type StepContext = {
  ctx: ActionCtx;
  run: Doc<"wikiCheckupRuns">;
  companyId: Scope;
  full: boolean;
  state: StepState;
  startedAt: number;
};
export type StepResult = { again?: boolean; state?: StepState; done: number };

/** One invocation stops starting new work after this, and continues itself. */
export const STEP_TIME_BUDGET_MS = 4 * 60 * 1000;


export function outOfTime(step: StepContext): boolean {
  return Date.now() - step.startedAt > STEP_TIME_BUDGET_MS;
}

export function errorLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 300) || "No detail given.";
}

async function resolveModel(ctx: ActionCtx) {
  return await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, { useCase: "fast-chat" });
}

/** One model call, written into the same cost ledger every other agent's uses. */
export async function ask(
  step: Pick<StepContext, "ctx" | "companyId">,
  args: { context: string; system: string; prompt: string }
): Promise<string> {
  const model = await resolveModel(step.ctx);
  const response = await generateTextWithResolvedModel({
    model,
    systemInstruction: args.system,
    contents: [{ type: "text", text: args.prompt }],
  });
  await step.ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
    systemKey: "WIKI_CHECKUP",
    companyId: step.companyId,
    actionContext: args.context,
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    inputTokens: response.inputTokens ?? 0,
    outputTokens: response.outputTokens ?? 0,
    promptContent: args.prompt,
    responseContent: response.text ?? "",
  });
  return response.text ?? "";
}

export async function progress(
  step: Pick<StepContext, "ctx" | "run">,
  args: { stepKey?: WikiCheckupStepKey; done?: number; total?: number; found?: Partial<WikiCheckupFound>; note?: string }
) {
  await step.ctx.runMutation(internal.wikiCheckup.advanceRunInternal, {
    runId: step.run._id,
    ...(args.stepKey ? { stepKey: args.stepKey } : {}),
    ...(args.done ? { addDone: args.done } : {}),
    ...(args.total ? { addTotal: args.total } : {}),
    ...(args.found ? { found: args.found } : {}),
    ...(args.note ? { note: args.note } : {}),
  });
}

export async function staffActive(ctx: ActionCtx, systemKey: string): Promise<boolean> {
  return await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey });
}

/** Page counts for the run's plan, a page of the wiki at a time. */
export async function countPages(ctx: ActionCtx, companyId: Scope): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard += 1) {
    const result: { counts: Record<string, number>; isDone: boolean; continueCursor: string } =
      await ctx.runQuery(internal.wikiCheckup.countPagesInternal, {
        companyId,
        paginationOpts: { numItems: 200, cursor },
      });
    for (const [kind, count] of Object.entries(result.counts)) counts[kind] = (counts[kind] ?? 0) + count;
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Settling a disputed fact.
// ---------------------------------------------------------------------------

export type Side = { page: Doc<"wikiPages">; claim: string };

export function numberedSources(
  documents: Array<{ title: string; at: number; fromWeb: boolean; text: string }>
): string {
  if (documents.length === 0) return "(no kept source documents)";
  return documents
    .map(
      (document, index) =>
        `[${index + 1}] ${document.title} — added or last changed ${new Date(document.at).toISOString().slice(0, 16).replace("T", " ")} UTC${document.fromWeb ? " (found on the web)" : ""}\n${document.text}`
    )
    .join("\n\n");
}

/**
 * Settle one disagreement by the plan's rules. The model only reports facts
 * — is this a real disagreement, which sources state each claim, does a pin
 * state it — and the rules in code decide. Returns what happened.
 */
export async function settleOne(
  step: Pick<StepContext, "ctx" | "companyId">,
  a: Side,
  b: Side
): Promise<"SETTLED" | "KEPT_BOTH" | "NOT_GENUINE" | "FAILED"> {
  const sourcesA = await step.ctx.runQuery(internal.wikiCheckup.getSettlingSourcesInternal, { pageId: a.page._id });
  const sourcesB = await step.ctx.runQuery(internal.wikiCheckup.getSettlingSourcesInternal, { pageId: b.page._id });
  const keyA = linkKeyFor(a.page.kind, a.page.subjectKey);
  const keyB = linkKeyFor(b.page.kind, b.page.subjectKey);
  const pins = (page: Doc<"wikiPages">) =>
    page.pinnedCorrections.length ? page.pinnedCorrections.map((pin) => `- ${pin.text}`).join("\n") : "(none)";
  const prompt =
    `Claim A, from page ${keyA}: "${a.claim}"\nPinned corrections on ${keyA}:\n${pins(a.page)}\nSources of ${keyA}:\n${numberedSources(sourcesA.documents)}\n\n` +
    `Claim B, from page ${keyB}: "${b.claim}"\nPinned corrections on ${keyB}:\n${pins(b.page)}\nSources of ${keyB}:\n${numberedSources(sourcesB.documents)}`;
  const text = await ask(step, {
    context: "Wiki Check-up: settling a disagreement",
    system:
      "You check a disagreement between two wiki pages against their own sources. You decide nothing; you report facts. " +
      'Reply with strict JSON, nothing else: {"genuine": boolean, "a": {"pinned": boolean, "supportedBy": [number]}, "b": {"pinned": boolean, "supportedBy": [number]}}. ' +
      "genuine is false unless the two claims state the same fact in incompatible ways (different emphasis or detail is not a disagreement). " +
      "pinned is true only if one of that page's pinned corrections states that claim. supportedBy lists the numbers of that page's sources that actually state that claim — an empty list when none do.",
    prompt,
  });
  const parsed = parseJsonObject(text);
  if (!parsed) return "FAILED";
  if (parsed.genuine !== true) return "NOT_GENUINE";
  const side = (raw: unknown, documents: typeof sourcesA.documents): SettlingSide => {
    const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const indexes = Array.isArray(record.supportedBy) ? record.supportedBy : [];
    const supporting = indexes
      .filter((value): value is number => typeof value === "number" && Number.isInteger(value))
      .map((value) => documents[value - 1])
      .filter((document): document is (typeof documents)[number] => Boolean(document));
    return {
      pinned: record.pinned === true,
      sources: supporting.map((document) => ({ at: document.at, fromWeb: document.fromWeb })),
    };
  };
  const verdict = settleDisagreement(side(parsed.a, sourcesA.documents), side(parsed.b, sourcesB.documents));

  if (!verdict.winner) {
    await step.ctx.runMutation(internal.wikiCheckupPages.appendDisagreeNoteInternal, {
      companyId: step.companyId,
      pageId: a.page._id,
      otherPage: b.page.subjectKey,
      note: buildSourcesDisagreeNote({ claimHere: a.claim, claimThere: b.claim, otherPage: b.page.subjectKey }),
    });
    await step.ctx.runMutation(internal.wikiCheckupPages.appendDisagreeNoteInternal, {
      companyId: step.companyId,
      pageId: b.page._id,
      otherPage: a.page.subjectKey,
      note: buildSourcesDisagreeNote({ claimHere: b.claim, claimThere: a.claim, otherPage: a.page.subjectKey }),
    });
    return "KEPT_BOTH";
  }

  const winner = verdict.winner === "A" ? a : b;
  const loser = verdict.winner === "A" ? b : a;
  const rewritten = await ask(step, {
    context: "Wiki Check-up: correcting a page",
    system: [
      "You correct one fact on one page of a company's wiki. You are given the page, the claim on it that is wrong, and the correct fact.",
      "- Replace the wrong claim with the correct fact. Change nothing else, add nothing else.",
      "- Keep every [[reference]] the page already makes.",
      `- At most ${WIKI_PAGE_MAX_CHARS} characters.`,
      "Reply with the complete corrected page text and nothing else.",
    ].join("\n"),
    prompt: `The page:\n${loser.page.content}\n\nThe wrong claim: "${loser.claim}"\nThe correct fact: "${winner.claim}"`,
  });
  const verdictText = validateRewrittenPage(rewritten);
  if (!verdictText.ok) return "FAILED";
  const changed = await step.ctx.runMutation(internal.wikiCheckupPages.applyCheckupFixInternal, {
    companyId: step.companyId,
    pageId: loser.page._id,
    content: verdictText.content,
    rule: verdict.rule,
    detail: `"${loser.claim}" became "${winner.claim}" — ${describeSettlingRule(verdict.rule)} (from ${linkKeyFor(winner.page.kind, winner.page.subjectKey)}).`,
  });
  return changed ? "SETTLED" : "FAILED";
}

/** A page as a contradiction check reads it: its key and the start of its words. */
export type ClusterPage = { kind: string; subjectKey: string; excerpt: string };
export type Contradiction = { pageA: string; claimA: string; pageB: string; claimB: string };

/**
 * Claims in a set of related pages that state the same fact two incompatible ways, as the model reads them. Shared by the
 * nightly check-up's rota and the check as a document comes in (wikiSettleOnArrival.ts), so both ask the same question.
 * At most `most` findings, each naming two pages of the set.
 */
export async function findContradictions(step: Pick<StepContext, "ctx" | "companyId">, cluster: readonly ClusterPage[], most = 5): Promise<Contradiction[]> {
  const text = await ask(step, {
    context: "Wiki Check-up: looking for contradictions",
    system:
      "You read a set of related wiki pages together and report claims that GENUINELY disagree — the same fact stated two incompatible ways. Different emphasis or level of detail is NOT a contradiction. " +
      'Reply with strict JSON, nothing else: {"contradictions": [{"pageA": string, "claimA": string, "pageB": string, "claimB": string}]} — pageA/pageB exactly as named, claimA/claimB quoting each page\'s own sentence. An empty list is the right answer for most healthy wikis.',
    prompt: cluster.map((page) => `=== ${page.kind}:${page.subjectKey} ===\n${page.excerpt}`).join("\n\n"),
  });
  const parsed = parseJsonObject(text);
  const keys = new Set(cluster.map((page) => `${page.kind}:${page.subjectKey}`));
  return (Array.isArray(parsed?.contradictions) ? parsed.contradictions : [])
    .filter((entry): entry is Contradiction => {
      if (!entry || typeof entry !== "object") return false;
      const row = entry as Record<string, unknown>;
      return typeof row.pageA === "string" && typeof row.claimA === "string" && typeof row.pageB === "string" && typeof row.claimB === "string"
        && keys.has(row.pageA) && keys.has(row.pageB) && row.pageA !== row.pageB;
    })
    .slice(0, most);
}

/** One disagreement's key, so the same one is raised or settled once however often it's found. */
export function contradictionKey(finding: Contradiction): string {
  return `CONTRADICTION::${[finding.pageA, finding.pageB].sort().join("::")}::${finding.claimA.toLowerCase().replace(/\s+/g, " ").slice(0, 60)}`;
}

/** Rewrite a page so it agrees with its sources again; nothing new is added. */
export async function correctFromSources(
  step: Pick<StepContext, "ctx" | "companyId">,
  page: Doc<"wikiPages">,
  claim: string,
  documents: Array<{ title: string; at: number; fromWeb: boolean; text: string }>
): Promise<boolean> {
  const pinned = page.pinnedCorrections.length
    ? `Pinned corrections (ground truth, never contradict, do not repeat):\n${page.pinnedCorrections.map((pin) => `- ${pin.text}`).join("\n")}\n\n`
    : "";
  const rewritten = await ask(step, {
    context: "Wiki Check-up: bringing a page back in line with its sources",
    system: [
      "You keep one page of a company's wiki true to its source documents.",
      "- One claim on the page is no longer supported by the sources. Update it to what the sources now say, or remove it if no source supports it.",
      "- Change only the words the sources contradict. Keep the rest of that sentence, and every other sentence, exactly as written.",
      "- Where the sources disagree with each other, follow the newest one — by a date written in the source itself (such as \"updated March 2026\") where it gives one, otherwise by when it was added. A company document counts over a page found on the web.",
      "- Keep everything else on the page as it is, including facts that came from conversations rather than documents.",
      "- Never add anything the sources do not say. Never contradict a pinned correction.",
      "- Keep every [[reference]] the page already makes.",
      `- At most ${WIKI_PAGE_MAX_CHARS} characters.`,
      "Reply with the complete page text and nothing else.",
    ].join("\n"),
    prompt: `${pinned}The page:\n${page.content}\n\nThe claim the sources no longer support: "${claim}"\n\nThe sources:\n${numberedSources(documents)}`,
  });
  const verdict = validateRewrittenPage(rewritten);
  if (!verdict.ok) return false;
  return await step.ctx.runMutation(internal.wikiCheckupPages.applyCheckupFixInternal, {
    companyId: step.companyId,
    pageId: page._id,
    content: verdict.content,
    rule: "SOURCES",
    detail: `The sources no longer support "${claim.slice(0, 200)}".`,
  });
}

// ---------------------------------------------------------------------------
// Following changed and removed files.
// ---------------------------------------------------------------------------

export async function followSourceChanges(
  step: Pick<StepContext, "ctx" | "companyId">,
  limit: number
): Promise<number> {
  const changes = await step.ctx.runQuery(internal.wikiCheckupPages.listPendingSourceChangesInternal, {
    companyId: step.companyId,
    limit,
  });
  let followed = 0;
  for (const change of changes) {
    try {
      // A re-upload whose words did not change asks the model nothing.
      const unchanged =
        change.kind === "CHANGED" &&
        (() => {
          const { removed, added } = changedSentences(change.oldContent, change.newContent ?? "");
          return !removed && !added;
        })();
      for (const pageId of unchanged ? [] : change.pageIds) {
        if (change.kind === "REMOVED") {
          const left = await step.ctx.runMutation(internal.wikiCheckupPages.dropDocumentReceiptInternal, {
            companyId: step.companyId,
            pageId,
            documentId: change.documentId,
          });
          if (!left) continue;
          if (left.remainingDocuments === 0 && left.remainingOther === 0 && !left.pinned) {
            await step.ctx.runMutation(internal.wikiCheckupPages.removePageInternal, {
              companyId: step.companyId,
              pageId,
              reason: `The only file behind this page was removed: ${change.title}`,
            });
            continue;
          }
          const page = await step.ctx.runQuery(internal.wikiCheckup.getPageForCheckupInternal, {
            companyId: step.companyId,
            pageId,
          });
          if (!page) continue;
          const remaining = await step.ctx.runQuery(internal.wikiCheckup.getSettlingSourcesInternal, { pageId });
          const rewritten = await ask(step, {
            context: "Wiki Check-up: following a removed file",
            system: [
              "A document one page of a company's wiki was partly written from has been removed. The page must no longer say what only that document said.",
              "- Remove every claim that comes from the removed document and is not supported by a remaining source.",
              "- Keep everything else exactly as it is, including what does not appear in the removed document.",
              "- Add nothing. Keep every [[reference]] the page already makes.",
              "Reply with the complete page text and nothing else.",
            ].join("\n"),
            prompt:
              // The parts of the removed document about this page, from
              // anywhere in it — not its opening 6,000 characters (2026-11-12).
              `The page:\n${page.content}\n\nThe removed document ("${change.title}"), the parts about this page:\n${relevantPassages(change.oldContent, subjectWords(page.subjectKey, page.title), 12_000)}\n\n` +
              `The remaining sources:\n${numberedSources(remaining.documents)}`,
          });
          const verdict = validateRewrittenPage(rewritten);
          if (verdict.ok) {
            await step.ctx.runMutation(internal.wikiCheckupPages.applyCheckupFixInternal, {
              companyId: step.companyId,
              pageId,
              content: verdict.content,
              rule: "SOURCE_REMOVED",
              detail: `The file "${change.title}" was removed.`,
            });
          }
        } else {
          const page = await step.ctx.runQuery(internal.wikiCheckup.getPageForCheckupInternal, {
            companyId: step.companyId,
            pageId,
          });
          if (!page) continue;
          const rewritten = await ask(step, {
            context: "Wiki Check-up: following a changed file",
            system: [
              "A document one page of a company's wiki was partly written from has changed. You are given only the sentences it dropped and the sentences it gained. Bring the page in line with the new version.",
              "- Change facts that changed; remove facts only the dropped sentences stated; add facts from the gained sentences that belong on this page.",
              "- Keep everything else exactly as it is. Never add anything neither version says.",
              "- Keep every [[reference]] the page already makes.",
              `- At most ${WIKI_PAGE_MAX_CHARS} characters.`,
              "Reply with the complete page text and nothing else.",
            ].join("\n"),
            // Only what changed, wherever it is in the document — the
            // check-up compared each version's first 5,000 characters, so an
            // edit further in never reached the pages (2026-11-12).
            prompt: (() => {
              const { removed, added } = changedSentences(change.oldContent, change.newContent ?? "");
              return (
                `The page:\n${page.content}\n\nWhat the document "${change.title}" no longer says:\n${removed || "(nothing removed)"}\n\n` +
                `What it says now that it did not before:\n${added || "(nothing added)"}`
              );
            })(),
          });
          const verdict = validateRewrittenPage(rewritten);
          if (verdict.ok) {
            await step.ctx.runMutation(internal.wikiCheckupPages.applyCheckupFixInternal, {
              companyId: step.companyId,
              pageId,
              content: verdict.content,
              rule: "SOURCE_CHANGED",
              detail: `The file "${change.title}" changed.`,
            });
          }
        }
      }
      await step.ctx.runMutation(internal.wikiCheckupPages.settleSourceChangeInternal, { changeId: change._id, ok: true });
      // A changed file's pages now say something new: what they disagree with is settled straight away (wikiSettleOnArrival.ts).
      if (change.kind === "CHANGED") {
        await step.ctx.scheduler.runAfter(0, internal.wikiSettleOnArrival.settleDocumentPagesInternal, {
          ...(step.companyId ? { companyId: step.companyId } : {}),
          documentId: change.documentId,
        });
      }
      followed += 1;
    } catch (error) {
      console.error("The wiki could not follow a changed or removed file; it will try again", error);
      await step.ctx.runMutation(internal.wikiCheckupPages.settleSourceChangeInternal, { changeId: change._id, ok: false });
    }
  }
  return followed;
}

/** Ask the model to combine two pages about one subject into one page. */
export async function mergeText(step: Pick<StepContext, "ctx" | "companyId">, keep: Doc<"wikiPages">, drop: Doc<"wikiPages">) {
  const text = await ask(step, {
    context: "Wiki Check-up: merging two pages",
    system: [
      "You combine two pages of a company's wiki that cover the same subject into one page.",
      "- Keep every fact from both. Never add anything neither page says.",
      `- Where they state a fact differently, keep both and say plainly that the sources disagree.`,
      "- Keep the [[references]] both pages make. Plain sentences, no headings.",
      `- At most ${WIKI_PAGE_MAX_CHARS} characters.`,
      "Reply with the complete combined page text and nothing else.",
    ].join("\n"),
    prompt: `Page one (${keep.subjectKey}):\n${keep.content}\n\nPage two (${drop.subjectKey}):\n${drop.content}`,
  });
  return validateRewrittenPage(text);
}

