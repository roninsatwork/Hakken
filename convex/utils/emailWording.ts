import type { AppLanguage } from "./contentLanguages";

/**
 * The fixed words of the emails the outbox sends, in every language the
 * platform is read in — an email's own wording, as `messages/<language>.json`
 * is a screen's. What people write (a digest's opening, a News item) is
 * written once in English and translated by the Translator; these are not.
 * Typed by `AppLanguage`, so a language added to the list fails to build
 * until its wording is here.
 */
export type EmailWording = {
  /** How dates are written in this language. */
  dateLocale: string;
  weeklyNewsDigest: {
    /** The label beside the wordmark. */
    kind: string;
    subject: (args: { platformName: string }) => string;
    /** When the week's issue has no opening. */
    verdict: string;
    readOriginal: string;
    /** Over the week's Helpful content (IH19). */
    helpfulHeading: string;
    openNews: string;
    seeAll: (args: { count: number; platformName: string }) => string;
    /** Why the reader gets it, and how to stop. */
    whyYouGetIt: (args: { platformName: string }) => string;
    unsubscribe: string;
  };
  /** To super admins, when collecting stops for something only a person can fix. */
  collectionNeedsYou: {
    kind: string;
    subject: (args: { platformName: string }) => string;
    verdict: string;
    open: string;
    whyYouGetIt: (args: { platformName: string }) => string;
  };
  /** A Hakken task's alert, to the person who set it up (hakken-tasks-plan.md, item 1.4). */
  taskAlert: {
    kind: string;
    visitorsThatDay: string;
    shownThatDay: string;
    usualDay: string;
    about: (args: { count: string }) => string;
    seeWhatHappened: string;
    askWhy: (args: { platformName: string }) => string;
    whyYouGetIt: (args: { platformName: string }) => string;
  };
};

export const EMAIL_WORDING: Record<AppLanguage, EmailWording> = {
  en: {
    dateLocale: "en-GB",
    weeklyNewsDigest: {
      kind: "Weekly news",
      subject: ({ platformName }) => `This week in search, from ${platformName}`,
      verdict: "Here is what happened in search this week.",
      readOriginal: "Read the original",
      helpfulHeading: "Helpful content",
      openNews: "Open News",
      seeAll: ({ count, platformName }) => `See all ${count} on ${platformName}`,
      whyYouGetIt: ({ platformName }) => `You get this weekly email because you use ${platformName}.`,
      unsubscribe: "Stop these emails",
    },
    collectionNeedsYou: {
      kind: "Collection",
      subject: ({ platformName }) => `${platformName} stopped collecting: it needs you`,
      verdict: "Collecting data has stopped, and only a person can start it again.",
      open: "Open the collection pipeline",
      whyYouGetIt: ({ platformName }) => `You get this because you are a super admin of ${platformName}. It is sent at most once a day for each reason.`,
    },
    taskAlert: {
      kind: "Alert",
      visitorsThatDay: "Visitors that day",
      shownThatDay: "Times shown that day",
      usualDay: "A usual day",
      about: ({ count }) => `About ${count}`,
      seeWhatHappened: "See what happened",
      askWhy: ({ platformName }) => `Ask ${platformName} why`,
      whyYouGetIt: ({ platformName }) => `You’re getting this because you asked ${platformName} to keep an eye on this. You can pause or stop it any time in ${platformName} tasks.`,
    },
  },
  it: {
    dateLocale: "it-IT",
    weeklyNewsDigest: {
      kind: "Notizie della settimana",
      subject: ({ platformName }) => `Questa settimana nella ricerca, da ${platformName}`,
      verdict: "Ecco cosa è successo nella ricerca questa settimana.",
      readOriginal: "Leggi l'originale",
      helpfulHeading: "Contenuti utili",
      openNews: "Apri Notizie",
      seeAll: ({ count, platformName }) => `Vedi tutte le ${count} su ${platformName}`,
      whyYouGetIt: ({ platformName }) => `Ricevi questa email settimanale perché usi ${platformName}.`,
      unsubscribe: "Non ricevere più queste email",
    },
    collectionNeedsYou: {
      kind: "Raccolta",
      subject: ({ platformName }) => `${platformName} ha smesso di raccogliere: serve il tuo intervento`,
      verdict: "La raccolta dei dati si è fermata e solo una persona può farla ripartire.",
      open: "Apri la pipeline di raccolta",
      whyYouGetIt: ({ platformName }) => `La ricevi perché sei super admin di ${platformName}. Viene inviata al massimo una volta al giorno per ogni motivo.`,
    },
    taskAlert: {
      kind: "Avviso",
      visitorsThatDay: "Visitatori quel giorno",
      shownThatDay: "Volte mostrato quel giorno",
      usualDay: "Un giorno normale",
      about: ({ count }) => `Circa ${count}`,
      seeWhatHappened: "Guarda cosa è successo",
      askWhy: ({ platformName }) => `Chiedi a ${platformName} perché`,
      whyYouGetIt: ({ platformName }) => `La ricevi perché hai chiesto a ${platformName} di tenerlo d’occhio. Puoi metterlo in pausa o interromperlo quando vuoi in Attività di ${platformName}.`,
    },
  },
};

export function emailWording(language: string): EmailWording {
  return EMAIL_WORDING[language as AppLanguage] ?? EMAIL_WORDING.en;
}
