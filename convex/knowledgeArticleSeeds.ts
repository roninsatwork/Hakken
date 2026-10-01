import type { MutationCtx } from "./_generated/server";
import { syncArticleToWiki } from "./knowledgeArticleWiki";

/**
 * The Knowledge articles the platform ships with (docs/plans/active/
 * knowledge-news-and-digest-plan.md, phase 1). Each is added once, by its
 * key, through `dataMigrations.ts`; after that it belongs to Admin → Content →
 * Knowledge like any other article, and editing it there is never undone by
 * running the migration again.
 */

type SeedArticle = { key: string; titleEn: string; bodyEn: string; titleIt: string; bodyIt: string };

/**
 * How traffic is worked out (D2): customer-facing, plain words, citing the
 * Advanced Web Ranking click study. It does not name the supplier the figures
 * come from.
 */
export const TRAFFIC_ARTICLE: SeedArticle = {
  key: "traffic",
  titleEn: "How is traffic worked out?",
  bodyEn: `The traffic figure you see against a search is our best estimate of the visits it sends your website each month, and it is worked out rather than counted because nobody outside Google can see every click.

We start with how many people type that search into Google in a month and then work out how many of them are likely to click on you, which depends mostly on where you sit in the results.

## Where you rank matters most

The first result gets far more clicks than the fifth, and anything on page two gets very few. So two searches with the same number of people behind them can bring you very different traffic depending on whether you are at the top or further down.

## What sits above you matters too

Google often puts other things above the normal results, like a map of local businesses, an AI answer or adverts, and each of these takes clicks before anyone reaches the first link. That is why a page-one position can still show very little traffic.

As a rough guide, this is how many people click the first normal result:

| What is above it | Who clicks the first result |
|---|---|
| Nothing | About 1 in 5 |
| An AI answer | About 1 in 10 |
| A map | About 1 in 85 |

These figures come from the [Advanced Web Ranking click-through study](https://www.advancedwebranking.com/seo/organic-ctr) from July 2026, which looked at searches in the United States.

## What "<1" means

When you see "<1" we expect fewer than one visit a month from that search. It is not zero. It is a search with very few people behind it, or one where something above you takes most of the clicks, and it can still be worth having if the people searching are the right ones.

If you have connected Search Console, that is where you will find the real clicks for your own website.`,
  titleIt: "Come viene calcolato il traffico?",
  bodyIt: `Il traffico che vedi accanto a una ricerca è la nostra migliore stima delle visite che quella ricerca porta al tuo sito ogni mese. È una stima e non un conteggio, perché nessuno al di fuori di Google può vedere ogni singolo clic.

Partiamo da quante persone digitano quella ricerca su Google in un mese e poi calcoliamo quante di loro probabilmente cliccheranno sul tuo sito, cosa che dipende soprattutto dalla tua posizione nei risultati.

## Conta soprattutto la posizione

Il primo risultato riceve molti più clic del quinto, e quello che finisce in seconda pagina ne riceve pochissimi. Così due ricerche con lo stesso numero di persone possono portarti un traffico molto diverso a seconda che tu sia in cima o più in basso.

## Conta anche quello che c'è sopra di te

Spesso Google mette altre cose sopra i risultati normali, come una mappa con le attività locali, una risposta dell'AI o degli annunci, e ognuna di queste si prende dei clic prima che qualcuno arrivi al primo link. Per questo anche una posizione in prima pagina può mostrare pochissimo traffico.

Come indicazione di massima, ecco quante persone cliccano sul primo risultato normale:

| Cosa c'è sopra | Chi clicca sul primo risultato |
|---|---|
| Niente | Circa 1 su 5 |
| Una risposta dell'AI | Circa 1 su 10 |
| Una mappa | Circa 1 su 85 |

Questi dati vengono dallo [studio sui clic di Advanced Web Ranking](https://www.advancedwebranking.com/seo/organic-ctr) di luglio 2026, basato su ricerche negli Stati Uniti.

## Cosa significa "<1"

Quando vedi "<1" ci aspettiamo meno di una visita al mese da quella ricerca. Non è zero. È una ricerca con pochissime persone dietro, oppure una in cui qualcosa sopra di te si prende quasi tutti i clic, e può comunque valere la pena se chi cerca è la persona giusta.

Se hai collegato Search Console, lì trovi i clic reali del tuo sito.`,
};

/**
 * Adds the traffic article, published, unless an article with its key is
 * already there — so running it again, after the article has been edited or
 * unpublished in Admin, changes nothing. One document, one batch.
 */
export async function addTrafficArticle(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("knowledgeArticles")
    .withIndex("by_key", (q) => q.eq("key", TRAFFIC_ARTICLE.key))
    .first();
  if (!existing) {
    const now = Date.now();
    const articleId = await ctx.db.insert("knowledgeArticles", { ...TRAFFIC_ARTICLE, status: "PUBLISHED", publishedAt: now, updatedAt: now });
    const article = await ctx.db.get(articleId);
    // Written by the platform's team, not by anyone signed in: the brain's copy says so.
    if (article) await syncArticleToWiki(ctx, article, "platform");
  }
  return { cursor: null, isDone: true, processed: 1, updated: existing ? 0 : 1 };
}

/**
 * Copies every published article to the shared brain (phase 2), for those
 * published before Ask Hakken read them. Idempotent: an article whose copy is
 * already in step is left as it is.
 */
export async function syncPublishedArticles(ctx: MutationCtx, cursor: string | null, batchSize: number) {
  const page = await ctx.db
    .query("knowledgeArticles")
    .withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED"))
    .paginate({ cursor, numItems: batchSize });
  for (const article of page.page) await syncArticleToWiki(ctx, article, "platform");
  return { cursor: page.continueCursor, isDone: page.isDone, processed: page.page.length, updated: page.page.length };
}
