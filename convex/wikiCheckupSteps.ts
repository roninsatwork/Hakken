"use node";

import { internal } from "./_generated/api";
import {
  WIKI_TOPIC_KINDS,
  buildRewriteSystemInstruction,
  buildRewriteUserContent,
  linkKeyFor,
  normaliseTopicSlug,
  validateRewrittenPage,
  type WikiTopicKind,
} from "./wikiRewriteService";
import {
  WIKI_CHECKUP_CYCLE_DAYS,
  WIKI_MERGES_PER_NIGHT,
  WIKI_MISSING_PAGES_PER_NIGHT,
  WIKI_REFILES_PER_NIGHT,
  WIKI_ROTA_BOUNDS,
  WIKI_SETTLEMENTS_PER_NIGHT,
  WIKI_WEBSITE_REREADS_PER_NIGHT,
  findDuplicateCandidates,
  parseJsonObject,
  planTagMerges,
  rotaShare,
  type WikiCheckupFound,
  type WikiCheckupStepKey,
} from "./wikiCheckupRules";
import {
  ask,
  contradictionKey,
  correctFromSources,
  findContradictions,
  followSourceChanges,
  mergeText,
  numberedSources,
  outOfTime,
  progress,
  settleOne,
  staffActive,
  type StepContext,
  type StepResult,
} from "./wikiCheckupSettle";

/**
 * The daily check-up's seven steps (wiki-daily-checkup-plan.md), in the
 * order they run: take in, re-link, fill gaps, fix page types, tag, check
 * and correct, tidy. Each covers its share of a rota — or, in a hand-run
 * "Check this wiki now", every page — and stops starting new work near the
 * action time limit, continuing itself where it left off.
 */

const TOPIC_KINDS: Array<"PRODUCT" | "POLICY" | "ISSUE" | "CLIENT"> = ["PRODUCT", "POLICY", "ISSUE", "CLIENT"];

async function intakeStep(step: StepContext): Promise<StepResult> {
  const { ctx, companyId } = step;
  let done = 0;
  const followed = await followSourceChanges(step, step.full ? 50 : 20);
  done += followed;

  let documentsRead = 0;
  if (await staffActive(ctx, "WIKI_DISTILLER")) {
    const waiting = await ctx.runQuery(internal.wikiDistill.countUndistilledInternal, { companyId });
    if (waiting > 0) {
      // One batch now; the batch chains itself until nothing is left unread.
      await ctx.runAction(internal.wikiDistillActions.distilCompanyBatch, { companyId });
      documentsRead = Math.min(waiting, 5);
      done += documentsRead;
    }
  }

  let websitePagesQueued = 0;
  if (process.env.FIRECRAWL_API_KEY) {
    websitePagesQueued = await ctx.runMutation(internal.wikiCheckupPages.queueWebsiteRereadsInternal, {
      companyId,
      limit: step.full ? 200 : WIKI_WEBSITE_REREADS_PER_NIGHT,
    });
  }
  await progress(step, { found: { sourcesFollowed: followed, documentsRead, websitePagesQueued } });
  return { done: done + 1 };
}

async function relinkStep(step: StepContext): Promise<StepResult> {
  const { ctx, companyId, run } = step;
  const total = step.state.plan?.RELINK ?? 0;
  let done = step.state.stepDone ?? 0;
  // Nightly: pages not checked for six days come due, a day early, so the
  // weekly promise holds even on an uneven night. Full run: every page not
  // yet checked during this run.
  const before = step.full ? run.startedAt : Date.now() - (WIKI_CHECKUP_CYCLE_DAYS.links - 1) * 86_400_000;
  const share = step.full ? Number.MAX_SAFE_INTEGER : Math.max(0, total - 1);
  let linksFixed = 0;
  while (done < share) {
    if (outOfTime(step)) {
      await progress(step, { found: { linksFixed } });
      return { again: true, state: { ...step.state, stepDone: done }, done: 0 };
    }
    const pageIds = await ctx.runQuery(internal.wikiCheckup.getLinkRotaInternal, {
      companyId,
      before,
      limit: Math.min(100, share - done),
    });
    if (pageIds.length === 0) break;
    const result = await ctx.runMutation(internal.wikiCheckup.verifyLinksInternal, { companyId, pageIds });
    linksFixed += result.linksFixed;
    done += pageIds.length;
    await progress(step, { done: pageIds.length });
  }

  let linksAdded = 0;
  if (await staffActive(ctx, "WIKI_LINKER")) {
    try {
      const result = await ctx.runAction(internal.wikiTendingActions.crossLinkSweep, { companyId, limit: 20 });
      linksAdded = result.linked;
    } catch (error) {
      console.error("The linking pass failed; links are checked again tomorrow", error);
    }
  }
  await ctx.runMutation(internal.wikiPages.refreshHubPagesInternal, { companyId });
  await progress(step, { found: { linksFixed, linksAdded } });
  return { done: 1 };
}

async function gapsStep(step: StepContext): Promise<StepResult> {
  const { ctx, companyId } = step;
  let pagesWritten = 0;

  // 1. Pages for topics several pages mention but nobody has written. The
  // sample is the pages whose page-type check is due tonight — the refile
  // step stamps them next, so each night reads a fresh set, and a wiki with
  // nothing due costs nothing here.
  const sample = await ctx.runQuery(internal.wikiCheckup.getKindRotaInternal, {
    companyId,
    rota: "REFILE",
    kinds: TOPIC_KINDS,
    before: step.full ? step.run.startedAt : Date.now() - (WIKI_CHECKUP_CYCLE_DAYS.refile - 1) * 86_400_000,
    limit: 25,
    excerptChars: 600,
  });
  if (sample.length >= 2) {
    const index = await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, { companyId, includeCustomerPages: false });
    const names = index.map((entry) => entry.key.slice(entry.key.indexOf(":") + 1)).filter((name) => !name.endsWith("-index"));
    try {
      const text = await ask(step, {
        context: "Wiki Check-up: finding missing pages",
        system:
          "You find topics a company's wiki is missing. You are given some of its pages and the names of every page it has. " +
          'Reply with strict JSON, nothing else: {"topics": [{"kind": "PRODUCT"|"POLICY"|"ISSUE"|"CLIENT", "name": string, "mentionedIn": [string]}]} — at most 3. ' +
          "A topic counts only if at least two of the given pages mention it and no page in the list of names covers it. name is a short kebab-case name; mentionedIn lists the page names, exactly as given, that mention it. An empty list is the right answer for most wikis.",
        prompt:
          sample.map((page) => `=== ${page.subjectKey} (${page.kind}) ===\n${page.excerpt}`).join("\n\n") +
          `\n\nEvery page name on this wiki:\n${names.join(", ")}`,
      });
      const parsed = parseJsonObject(text);
      const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
      const cap = step.full ? 5 : WIKI_MISSING_PAGES_PER_NIGHT;
      for (const raw of topics) {
        if (pagesWritten >= cap) break;
        if (!raw || typeof raw !== "object") continue;
        const topic = raw as Record<string, unknown>;
        const kind = topic.kind as WikiTopicKind;
        const slug = typeof topic.name === "string" ? normaliseTopicSlug(topic.name) : null;
        if (!slug || !WIKI_TOPIC_KINDS.includes(kind) || names.includes(slug)) continue;
        const mentionedIn = (Array.isArray(topic.mentionedIn) ? topic.mentionedIn : [])
          .filter((name): name is string => typeof name === "string")
          .map((name) => sample.find((page) => page.subjectKey === name))
          .filter((page): page is (typeof sample)[number] => Boolean(page));
        if (mentionedIn.length < 2) continue;
        // Written only from documents that actually name the topic — never
        // from the model's general knowledge.
        const words = slug.split("-").filter((word) => word.length > 2);
        const material: Array<{ documentId: string; title: string; text: string }> = [];
        for (const page of mentionedIn) {
          const sources = await ctx.runQuery(internal.wikiCheckup.getSettlingSourcesInternal, { pageId: page.pageId });
          for (const document of sources.documents) {
            const lower = document.text.toLowerCase();
            if (words.length > 0 && words.every((word) => lower.includes(word)) && !material.some((entry) => entry.documentId === document.documentId)) {
              material.push({ documentId: document.documentId, title: document.title, text: document.text });
            }
          }
        }
        if (material.length === 0) continue;
        const prompt = buildRewriteUserContent({
          title: slug,
          currentContent: "",
          pinnedCorrections: [],
          eventLabel: "company documents that mention this topic",
          eventText: material.map((entry) => `From "${entry.title}":\n${entry.text}`).join("\n\n"),
          otherPages: names,
        });
        const written = validateRewrittenPage(
          await ask(step, { context: `Wiki Check-up: writing "${slug}"`, system: buildRewriteSystemInstruction(), prompt })
        );
        if (!written.ok) continue;
        await ctx.runMutation(internal.wikiPages.applyRewriteInternal, {
          companyId,
          kind,
          subjectKey: slug,
          title: slug,
          content: written.content,
          source: `DOCUMENT:${material[0].documentId}`,
          sourceLabel: `Document · ${material[0].title.slice(0, 80)}`,
        });
        const newKey = linkKeyFor(kind, slug);
        await ctx.runMutation(internal.wikiPages.addLinksInternal, {
          companyId,
          kind,
          subjectKey: slug,
          add: mentionedIn.map((page) => linkKeyFor(page.kind, page.subjectKey)),
        });
        for (const page of mentionedIn) {
          await ctx.runMutation(internal.wikiPages.addLinksInternal, {
            companyId,
            kind: page.kind as "PRODUCT" | "POLICY" | "ISSUE",
            subjectKey: page.subjectKey,
            add: [newKey],
          });
        }
        names.push(slug);
        pagesWritten += 1;
      }
    } catch (error) {
      console.error("Finding missing pages failed; tomorrow's check-up tries again", error);
    }
  }

  // Sonae's second half, questions looked up on the web and filed with no person, isn't brought over
  // (wiki-sonae-catch-up-plan-2026-11-21.md, "Not brought over"): the wiki learns only from the company's own documents.
  await progress(step, { found: { pagesWritten } });
  return { done: 1 + pagesWritten };
}

async function refileStep(step: StepContext): Promise<StepResult> {
  const { ctx, companyId, run } = step;
  const total = step.state.plan?.REFILE ?? 0;
  let done = step.state.stepDone ?? 0;
  let moved = step.state.marker ?? 0;
  const cap = step.full ? 30 : WIKI_REFILES_PER_NIGHT;
  const before = step.full ? run.startedAt : Date.now() - (WIKI_CHECKUP_CYCLE_DAYS.refile - 1) * 86_400_000;
  const share = step.full ? Number.MAX_SAFE_INTEGER : total;
  let pagesRefiled = 0;
  let pagesMerged = 0;
  while (done < share) {
    if (outOfTime(step)) {
      await progress(step, { found: { pagesRefiled, pagesMerged } });
      return { again: true, state: { ...step.state, stepDone: done, marker: moved }, done: 0 };
    }
    const batch = await ctx.runQuery(internal.wikiCheckup.getKindRotaInternal, {
      companyId,
      rota: "REFILE",
      kinds: TOPIC_KINDS,
      before,
      limit: Math.min(15, share - done),
      excerptChars: 300,
    });
    if (batch.length === 0) break;
    try {
      const text = await ask(step, {
        context: "Wiki Check-up: checking page types",
        system:
          "You check that each page of a company's wiki is filed under the right type. PRODUCT: something the company sells or does. POLICY: how the company works — hours, delivery, returns, invoicing, guarantees. ISSUE: a problem or question that keeps coming up. CLIENT: a named client or organisation the company has done work for, or a case study of that work. " +
          'Reply with strict JSON, nothing else: {"moves": [{"name": string, "kind": "PRODUCT"|"POLICY"|"ISSUE"|"CLIENT"}]} — only pages clearly filed under the wrong type, name exactly as given. Most pages are filed correctly; an empty list is usual.',
        prompt: batch.map((page) => `${page.subjectKey} (filed as ${page.kind}): ${page.excerpt}`).join("\n\n"),
      });
      const parsed = parseJsonObject(text);
      const moves = Array.isArray(parsed?.moves) ? parsed.moves : [];
      for (const raw of moves) {
        if (moved >= cap) break;
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const page = batch.find((candidate) => candidate.subjectKey === entry.name);
        const kind = entry.kind as "PRODUCT" | "POLICY" | "ISSUE";
        if (!page || !TOPIC_KINDS.includes(kind) || page.kind === kind) continue;
        const result = await ctx.runMutation(internal.wikiCheckupPages.movePageKindInternal, {
          companyId,
          pageId: page.pageId,
          toKind: kind,
        });
        if (result.moved) {
          pagesRefiled += 1;
          moved += 1;
        } else if (result.conflictPageId) {
          // A page of that name already exists under the right type: the two
          // become one.
          const keep = await ctx.runQuery(internal.wikiCheckup.getPageForCheckupInternal, { companyId, pageId: result.conflictPageId });
          const drop = await ctx.runQuery(internal.wikiCheckup.getPageForCheckupInternal, { companyId, pageId: page.pageId });
          if (!keep || !drop) continue;
          const merged = await mergeText(step, keep, drop);
          if (!merged.ok) continue;
          const ok = await ctx.runMutation(internal.wikiCheckupPages.mergePagesInternal, {
            companyId,
            keepPageId: keep._id,
            dropPageId: drop._id,
            content: merged.content,
            rule: "REFILE_MERGE",
          });
          if (ok) {
            pagesMerged += 1;
            moved += 1;
          }
        }
      }
    } catch (error) {
      console.error("Checking page types failed for a batch; it comes round again", error);
    }
    await ctx.runMutation(internal.wikiCheckup.stampRotaInternal, { pageIds: batch.map((page) => page.pageId), rota: "REFILE" });
    done += batch.length;
    await progress(step, { done: batch.length });
  }
  await progress(step, { found: { pagesRefiled, pagesMerged } });
  return { done: 0 };
}

async function tagsStep(step: StepContext): Promise<StepResult> {
  const { ctx, companyId, run } = step;
  const total = step.state.plan?.TAGS ?? 0;
  let done = step.state.stepDone ?? 0;
  let tagsChanged = 0;

  if (done === 0) {
    // Near-duplicate spellings folded first, so new tags join the tidy set.
    const usage = await ctx.runQuery(internal.wikiCheckupPages.listTagUsageInternal, { companyId });
    for (const [from, to] of planTagMerges(usage)) {
      tagsChanged += await ctx.runMutation(internal.wikiCheckupPages.renameTagInternal, { companyId, from, to });
    }
  }

  const before = step.full ? run.startedAt : Date.now() - (WIKI_CHECKUP_CYCLE_DAYS.tags - 1) * 86_400_000;
  const share = step.full ? Number.MAX_SAFE_INTEGER : total;
  const tagKinds: Array<"PRODUCT" | "POLICY" | "ISSUE" | "CLIENT" | "GOAL" | "SOURCE"> = ["PRODUCT", "POLICY", "ISSUE", "CLIENT", "GOAL", "SOURCE"];
  while (done < share) {
    if (outOfTime(step)) {
      await progress(step, { found: { tagsChanged } });
      return { again: true, state: { ...step.state, stepDone: done }, done: 0 };
    }
    const batch = await ctx.runQuery(internal.wikiCheckup.getKindRotaInternal, {
      companyId,
      rota: "TAGS",
      kinds: tagKinds,
      before,
      limit: Math.min(15, share - done),
      excerptChars: 300,
    });
    if (batch.length === 0) break;
    const vocabulary = (await ctx.runQuery(internal.wikiCheckupPages.listTagUsageInternal, { companyId }))
      .slice(0, 60)
      .map((entry) => entry.tag);
    try {
      const text = await ask(step, {
        context: "Wiki Check-up: tagging pages",
        system:
          "You tag pages of a company's wiki so a reader can find related pages. Give each page one to five short tags (one or two words each) naming what it is about. " +
          "Reuse tags from the existing list whenever one fits; only invent a new tag when none does. " +
          'Reply with strict JSON, nothing else: {"pages": [{"name": string, "tags": [string]}]} — every page given, name exactly as given.',
        prompt:
          `Existing tags: ${vocabulary.length ? vocabulary.join(", ") : "(none yet)"}\n\n` +
          batch.map((page) => `${page.subjectKey} (${page.kind}): ${page.excerpt}`).join("\n\n"),
      });
      const parsed = parseJsonObject(text);
      const entries = Array.isArray(parsed?.pages) ? parsed.pages : [];
      for (const raw of entries) {
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const page = batch.find((candidate) => candidate.subjectKey === entry.name);
        if (!page || !Array.isArray(entry.tags)) continue;
        tagsChanged += await ctx.runMutation(internal.wikiCheckupPages.setMachineTagsInternal, {
          companyId,
          pageId: page.pageId,
          tags: entry.tags.filter((tag): tag is string => typeof tag === "string"),
        });
      }
    } catch (error) {
      console.error("Tagging failed for a batch; it comes round again", error);
    }
    await ctx.runMutation(internal.wikiCheckup.stampRotaInternal, { pageIds: batch.map((page) => page.pageId), rota: "TAGS" });
    done += batch.length;
    await progress(step, { done: batch.length });
  }
  await progress(step, { found: { tagsChanged } });
  return { done: 0 };
}

async function correctStep(step: StepContext): Promise<StepResult> {
  const { ctx, companyId, run } = step;
  const autonomous = await ctx.runQuery(internal.wikiCheckup.isAutonomousWikiInternal, {});
  const plan = step.state.plan ?? {};
  const contradictionShare = step.full ? Number.MAX_SAFE_INTEGER : (plan.CORRECT ?? 0);
  let done = step.state.stepDone ?? 0;
  let settledCount = step.state.marker ?? 0;
  const settleCap = step.full ? 40 : WIKI_SETTLEMENTS_PER_NIGHT;
  const found: Partial<WikiCheckupFound> = {};
  const bump = (key: keyof WikiCheckupFound, by = 1) => {
    found[key] = (found[key] ?? 0) + by;
  };

  const pageByKey = async (key: string) =>
    await ctx.runQuery(internal.wikiCheckup.getPageByKeyInternal, { companyId, pageKey: key });

  const handleDisagreement = async (keyA: string, claimA: string, keyB: string, claimB: string, dedupeKey: string) => {
    if (!autonomous) {
      const raised = await ctx.runMutation(internal.wikiQuestions.raiseQuestionInternal, {
        companyId,
        kind: "CONTRADICTION",
        pageKeyA: keyA,
        claimA,
        pageKeyB: keyB,
        claimB,
        dedupeKey,
      });
      if (raised) bump("questionsRaised");
      return;
    }
    if (settledCount >= settleCap) return;
    const pageA = await pageByKey(keyA);
    const pageB = await pageByKey(keyB);
    if (!pageA || !pageB || pageA._id === pageB._id) return;
    const outcome = await settleOne(step, { page: pageA, claim: claimA }, { page: pageB, claim: claimB });
    if (outcome === "SETTLED") {
      bump("factsSettled");
      settledCount += 1;
    } else if (outcome === "KEPT_BOTH") {
      bump("disagreementsKept");
      settledCount += 1;
    }
  };

  // First pass of the step: questions already waiting are settled too.
  if (done === 0 && autonomous) {
    const open = await ctx.runQuery(internal.wikiCheckup.listOpenFactQuestionsInternal, { companyId, limit: 10 });
    for (const question of open) {
      if (settledCount >= settleCap || outOfTime(step)) break;
      try {
        if (question.kind === "CONTRADICTION" && question.pageKeyB && question.claimB) {
          await handleDisagreement(question.pageKeyA, question.claimA, question.pageKeyB, question.claimB, question.dedupeKey);
        } else if (question.kind === "FRESHNESS") {
          const page = await pageByKey(question.pageKeyA);
          if (page && page.kind !== "GOAL" && page.kind !== "SOURCE") {
            const sources = await ctx.runQuery(internal.wikiCheckup.getSettlingSourcesInternal, { pageId: page._id });
            if (sources.documents.length > 0 && (await correctFromSources(step, page, question.claimA, sources.documents))) {
              bump("claimsCorrected");
              settledCount += 1;
            }
          }
        } else {
          continue;
        }
        await ctx.runMutation(internal.wikiCheckup.resolveQuestionByCheckupInternal, { questionId: question.questionId });
      } catch (error) {
        console.error("A waiting question could not be settled; it stays open for tomorrow", error);
      }
    }
  }

  // Contradictions: every topic page compared with its neighbours on a
  // weekly rota.
  if (await staffActive(ctx, "WIKI_CONTRADICTION_FINDER")) {
    const before = step.full ? run.startedAt : Date.now() - (WIKI_CHECKUP_CYCLE_DAYS.contradictions - 1) * 86_400_000;
    while (done < contradictionShare) {
      if (outOfTime(step)) {
        await progress(step, { found });
        return { again: true, state: { ...step.state, stepDone: done, marker: settledCount }, done: 0 };
      }
      const rota = await ctx.runQuery(internal.wikiCheckup.getKindRotaInternal, {
        companyId,
        rota: "CONTRADICTIONS",
        kinds: TOPIC_KINDS,
        before,
        limit: Math.min(24, contradictionShare - done),
        excerptChars: 700,
      });
      if (rota.length === 0) break;
      const visited = new Set<string>();
      for (const anchor of rota) {
        if (visited.has(anchor.pageId)) continue;
        // The anchor, the topic pages it links to, then more of the rota.
        const cluster: typeof rota = [anchor];
        visited.add(anchor.pageId);
        for (const link of anchor.links) {
          if (cluster.length >= 6) break;
          const kind = link.slice(0, link.indexOf(":"));
          if (!TOPIC_KINDS.includes(kind as "PRODUCT")) continue;
          const neighbour = await pageByKey(link);
          if (!neighbour || neighbour._id === anchor.pageId || neighbour.subjectKey.endsWith("-index")) continue;
          cluster.push({
            pageId: neighbour._id,
            kind: neighbour.kind,
            subjectKey: neighbour.subjectKey,
            title: neighbour.title,
            excerpt: neighbour.content.slice(0, 700),
            links: neighbour.links,
            pinned: [],
            updatedAt: neighbour.updatedAt,
          });
        }
        for (const other of rota) {
          if (cluster.length >= 8) break;
          if (visited.has(other.pageId) || other.kind !== anchor.kind) continue;
          cluster.push(other);
          visited.add(other.pageId);
        }
        if (cluster.length < 2) continue;
        try {
          for (const finding of await findContradictions(step, cluster)) {
            await handleDisagreement(finding.pageA, finding.claimA, finding.pageB, finding.claimB, contradictionKey(finding));
          }
        } catch (error) {
          console.error("A contradiction check failed for a group; it comes round again", error);
        }
      }
      const stamped = rota.filter((page) => visited.has(page.pageId)).map((page) => page.pageId);
      await ctx.runMutation(internal.wikiCheckup.stampRotaInternal, { pageIds: stamped, rota: "CONTRADICTIONS" });
      done += stamped.length;
      await progress(step, { done: stamped.length });
      if (stamped.length === 0) break;
    }
  }

  // Out-of-date facts: every document-taught page checked against its
  // sources on a monthly rota.
  if (await staffActive(ctx, "WIKI_FRESHNESS_CHECKER")) {
    const topicCount = TOPIC_KINDS.reduce((sum, kind) => sum + (plan[`count_${kind}`] ?? 0), 0);
    const share = step.full
      ? 200
      : rotaShare({
          eligible: Math.max(topicCount, 1),
          cycleDays: WIKI_CHECKUP_CYCLE_DAYS.sources,
          min: WIKI_ROTA_BOUNDS.sources.min,
          max: WIKI_ROTA_BOUNDS.sources.max,
        });
    const before = step.full ? run.startedAt : Date.now() - (WIKI_CHECKUP_CYCLE_DAYS.sources - 1) * 86_400_000;
    const due = await ctx.runQuery(internal.wikiCheckup.getKindRotaInternal, {
      companyId,
      rota: "SOURCES",
      kinds: TOPIC_KINDS,
      before,
      limit: share,
      excerptChars: 3000,
      full: step.full,
    });
    for (const candidate of due) {
      if (outOfTime(step)) break;
      try {
        const sources = await ctx.runQuery(internal.wikiCheckup.getSettlingSourcesInternal, { pageId: candidate.pageId });
        if (sources.documents.length > 0) {
          const text = await ask(step, {
            context: "Wiki Check-up: checking a page against its sources",
            system:
              "You check whether a wiki page's claims are still supported by the source documents it was written from. " +
              "Each source shows when it was added or last changed. Where the sources disagree with each other, the newest one counts — judged by a date written in the source itself (such as \"updated March 2026\") where it gives one, otherwise by when it was added — and a company document counts over a page found on the web. A claim only an older or outranked source supports is NOT supported. " +
              'Reply with strict JSON, nothing else: {"supported": boolean, "unsupportedClaim": string} — supported=true when the sources still back the page (unsupportedClaim then empty); when false, unsupportedClaim quotes the page\'s own sentence the sources no longer support. Claims from conversations rather than documents do not count against the page.',
            prompt: `The page (${candidate.kind}:${candidate.subjectKey}):\n${candidate.excerpt}\n\nThe kept sources:\n${numberedSources(sources.documents)}`,
          });
          const parsed = parseJsonObject(text);
          const claim =
            parsed?.supported === false && typeof parsed.unsupportedClaim === "string" ? parsed.unsupportedClaim.trim() : "";
          if (claim) {
            if (autonomous) {
              const page = await ctx.runQuery(internal.wikiCheckup.getPageForCheckupInternal, { companyId, pageId: candidate.pageId });
              if (page && (await correctFromSources(step, page, claim, sources.documents))) bump("claimsCorrected");
            } else {
              const raised = await ctx.runMutation(internal.wikiQuestions.raiseQuestionInternal, {
                companyId,
                kind: "FRESHNESS",
                pageKeyA: `${candidate.kind}:${candidate.subjectKey}`,
                claimA: claim,
                detail: "The kept sources no longer support this claim. Check it, then edit or pin the page.",
                dedupeKey: `FRESHNESS::${candidate.kind}:${candidate.subjectKey}::${claim.toLowerCase().replace(/\s+/g, " ").slice(0, 60)}`,
              });
              if (raised) bump("questionsRaised");
            }
          }
        }
      } catch (error) {
        console.error("A source check failed for a page; it comes round again", error);
      }
      await ctx.runMutation(internal.wikiCheckup.stampRotaInternal, { pageIds: [candidate.pageId], rota: "SOURCES" });
    }
  }
  await progress(step, { found });
  return { done: 1 };
}

async function tidyStep(step: StepContext): Promise<StepResult> {
  const { ctx, companyId } = step;
  let pagesTidied = 0;
  let linksFixed = 0;
  let pagesMerged = 0;
  if (await staffActive(ctx, "WIKI_TIDIER")) {
    const candidates = await ctx.runQuery(internal.wikiTending.getTendingCandidatesInternal, { companyId });
    if (candidates.linkRepairs.length > 0 || candidates.overgrown.length > 0) {
      try {
        const result = await ctx.runAction(internal.wikiTendingActions.tendCompany, { companyId });
        pagesTidied = result.tidiedPages;
        linksFixed = result.repairedLinks;
      } catch (error) {
        console.error("Tidying failed; the pages stand as they were", error);
      }
    }
    // Duplicates: same-kind pages with near-identical names, confirmed by
    // the model before anything is merged. Only pairs with a page changed
    // this week are asked about, so an old pair judged distinct is not asked
    // again every night.
    const index = await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, { companyId, includeCustomerPages: false });
    const topicPages = index
      .map((entry) => {
        const separator = entry.key.indexOf(":");
        return { kind: entry.key.slice(0, separator), subjectKey: entry.key.slice(separator + 1) };
      })
      .filter((page) => TOPIC_KINDS.includes(page.kind as "PRODUCT") && !page.subjectKey.endsWith("-index"));
    const cap = step.full ? 10 : WIKI_MERGES_PER_NIGHT;
    const weekAgo = Date.now() - 8 * 86_400_000;
    for (const [keyA, keyB] of findDuplicateCandidates(topicPages)) {
      if (pagesMerged >= cap || outOfTime(step)) break;
      const pageA = await ctx.runQuery(internal.wikiCheckup.getPageByKeyInternal, { companyId, pageKey: keyA });
      const pageB = await ctx.runQuery(internal.wikiCheckup.getPageByKeyInternal, { companyId, pageKey: keyB });
      if (!pageA || !pageB) continue;
      if (!step.full && pageA.updatedAt < weekAgo && pageB.updatedAt < weekAgo) continue;
      try {
        const judged = parseJsonObject(
          await ask(step, {
            context: "Wiki Check-up: checking a possible duplicate",
            system: 'You decide whether two wiki pages cover the same subject. Reply with strict JSON, nothing else: {"same": boolean}. Related but distinct subjects are not the same.',
            prompt: `Page one (${pageA.subjectKey}):\n${pageA.content.slice(0, 1500)}\n\nPage two (${pageB.subjectKey}):\n${pageB.content.slice(0, 1500)}`,
          })
        );
        if (judged?.same !== true) continue;
        const keepFirst = (pageA.documentSourceCount ?? 0) >= (pageB.documentSourceCount ?? 0);
        const keep = keepFirst ? pageA : pageB;
        const drop = keepFirst ? pageB : pageA;
        if (drop.pinnedCorrections.length > 0 && keep.pinnedCorrections.length === 0) {
          // The page a person pinned is the one kept.
          const merged = await mergeText(step, drop, keep);
          if (merged.ok && (await ctx.runMutation(internal.wikiCheckupPages.mergePagesInternal, { companyId, keepPageId: drop._id, dropPageId: keep._id, content: merged.content, rule: "DUPLICATE_MERGE" }))) {
            pagesMerged += 1;
          }
          continue;
        }
        const merged = await mergeText(step, keep, drop);
        if (merged.ok && (await ctx.runMutation(internal.wikiCheckupPages.mergePagesInternal, { companyId, keepPageId: keep._id, dropPageId: drop._id, content: merged.content, rule: "DUPLICATE_MERGE" }))) {
          pagesMerged += 1;
        }
      } catch (error) {
        console.error("A duplicate check failed; it is asked again later", error);
      }
    }
  }
  await progress(step, { found: { pagesTidied, linksFixed, pagesMerged } });
  return { done: 1 };
}

export const STEP_HANDLERS: Record<WikiCheckupStepKey, (step: StepContext) => Promise<StepResult>> = {
  INTAKE: intakeStep,
  RELINK: relinkStep,
  GAPS: gapsStep,
  REFILE: refileStep,
  TAGS: tagsStep,
  CORRECT: correctStep,
  TIDY: tidyStep,
};
