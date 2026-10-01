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
    openNews: string;
    seeAll: (args: { count: number; platformName: string }) => string;
    /** Why the reader gets it, and how to stop. */
    whyYouGetIt: (args: { platformName: string }) => string;
    unsubscribe: string;
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
      openNews: "Open News",
      seeAll: ({ count, platformName }) => `See all ${count} on ${platformName}`,
      whyYouGetIt: ({ platformName }) => `You get this weekly email because you use ${platformName}.`,
      unsubscribe: "Stop these emails",
    },
  },
  it: {
    dateLocale: "it-IT",
    weeklyNewsDigest: {
      kind: "Notizie della settimana",
      subject: ({ platformName }) => `Questa settimana nella ricerca, da ${platformName}`,
      verdict: "Ecco cosa è successo nella ricerca questa settimana.",
      readOriginal: "Leggi l'originale",
      openNews: "Apri Notizie",
      seeAll: ({ count, platformName }) => `Vedi tutte le ${count} su ${platformName}`,
      whyYouGetIt: ({ platformName }) => `Ricevi questa email settimanale perché usi ${platformName}.`,
      unsubscribe: "Non ricevere più queste email",
    },
  },
};

export function emailWording(language: string): EmailWording {
  return EMAIL_WORDING[language as AppLanguage] ?? EMAIL_WORDING.en;
}
