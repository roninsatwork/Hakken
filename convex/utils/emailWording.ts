import type { AppLanguage } from "./contentLanguages";

/**
 * The fixed words of the platform's emails, in every language the platform is
 * read in — an email's own wording, as `messages/<language>.json`
 * is a screen's. What people write (a digest's opening, a News item) is
 * written once in English and translated by the Translator; these are not.
 * Typed by `AppLanguage`, so a language added to the list fails to build
 * until its wording is here.
 */
export type EmailWording = {
  /** How dates are written in this language. */
  dateLocale: string;
  /**
   * The sign-in link (`auth.ts`), in style B's friendly words (board
   * MailSignInLink, hakken-tasks-plan.md 3.3). Sent before anyone is known, so
   * in English until the sign-in screen says which language it was read in.
   */
  signIn: {
    kind: string;
    subject: (args: { platformName: string }) => string;
    verdict: (args: { platformName: string }) => string;
    lede: string;
    button: string;
    lasts: (args: { hours: number }) => string;
    notYou: string;
  };
  /**
   * The invitation's fixed words (board MailInvitation). Its headline, opening
   * and button are the admin's editable template (`invites.ts`), with
   * `{inviter}`, `{company}` and `{platform}` filled in when it is sent.
   */
  invitation: {
    kind: string;
    notExpecting: string;
  };
  /** The sign-in code (board MailSignInCode): the code big, the headline reading on from it. */
  signInCode: {
    kind: string;
    subject: (args: { platformName: string; code: string }) => string;
    verdict: (args: { platformName: string }) => string;
    lede: string;
    lasts: (args: { minutes: number }) => string;
    notYou: string;
  };
  weeklyNewsDigest: {
    /** The label beside the wordmark. */
    kind: string;
    subject: (args: { platformName: string }) => string;
    /** When the week's issue has no opening. */
    verdict: string;
    /** Under the week's count, as drawn: "4 / things worth knowing in search this week". */
    worthKnowing: (args: { count: number }) => string;
    plainWords: string;
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
    verdict: (args: { platformName: string }) => string;
    lede: string;
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
    signIn: {
      kind: "Sign in",
      subject: ({ platformName }) => `Sign in to ${platformName}`,
      verdict: ({ platformName }) => `Sign in to ${platformName}`,
      lede: "Tap the button and you’re in. There’s no password to remember.",
      button: "Sign me in",
      lasts: ({ hours }) => `The link works once and lasts about ${hours} ${hours === 1 ? "hour" : "hours"}.`,
      notYou: "Didn’t ask for this? You can ignore this email. Nothing happens unless the link is used.",
    },
    invitation: {
      kind: "Invitation",
      notExpecting: "Not expecting this? You can ignore it. Nothing happens until you accept.",
    },
    signInCode: {
      kind: "Sign in",
      subject: ({ platformName, code }) => `Your ${platformName} sign-in code: ${code}`,
      verdict: ({ platformName }) => `is your ${platformName} sign-in code`,
      lede: "Type it on the sign-in screen. It works on any device, not just the one you asked from.",
      lasts: ({ minutes }) => `It works once and lasts about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
      notYou: "Didn’t ask to sign in? You can ignore this email. Nobody can use this code but you.",
    },
    weeklyNewsDigest: {
      kind: "Weekly news",
      subject: ({ platformName }) => `This week in search, from ${platformName}`,
      verdict: "Here is what happened in search this week.",
      worthKnowing: ({ count }) => (count === 1 ? "thing worth knowing in search this week" : "things worth knowing in search this week"),
      plainWords: "In plain words, and what each one means for your websites.",
      readOriginal: "Read the original",
      helpfulHeading: "Helpful content",
      openNews: "Open News",
      seeAll: ({ count, platformName }) => `See all ${count} in ${platformName}`,
      whyYouGetIt: ({ platformName }) => `You get this every week because you use ${platformName}.`,
      unsubscribe: "Stop these emails",
    },
    collectionNeedsYou: {
      kind: "Collection",
      subject: ({ platformName }) => `${platformName} stopped collecting: it needs you`,
      verdict: ({ platformName }) => `${platformName} stopped collecting, and needs you to start it again`,
      lede: "This is something only a person can fix.",
      open: "Open the collection page",
      whyYouGetIt: ({ platformName }) => `You get this because you’re a super admin of ${platformName}. It’s sent at most once a day for each reason.`,
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
    signIn: {
      kind: "Accesso",
      subject: ({ platformName }) => `Accedi a ${platformName}`,
      verdict: ({ platformName }) => `Accedi a ${platformName}`,
      lede: "Tocca il pulsante ed entri. Non c’è nessuna password da ricordare.",
      button: "Fammi entrare",
      lasts: ({ hours }) => `Il link funziona una volta e dura circa ${hours} ${hours === 1 ? "ora" : "ore"}.`,
      notYou: "Non l’hai chiesto tu? Puoi ignorare questa email. Non succede nulla se il link non viene usato.",
    },
    invitation: {
      kind: "Invito",
      notExpecting: "Non te lo aspettavi? Puoi ignorarlo. Non succede nulla finché non accetti.",
    },
    signInCode: {
      kind: "Accesso",
      subject: ({ platformName, code }) => `Il tuo codice di accesso a ${platformName}: ${code}`,
      verdict: ({ platformName }) => `è il tuo codice di accesso a ${platformName}`,
      lede: "Scrivilo nella schermata di accesso. Funziona su qualsiasi dispositivo, non solo su quello da cui l’hai chiesto.",
      lasts: ({ minutes }) => `Funziona una volta e dura circa ${minutes} ${minutes === 1 ? "minuto" : "minuti"}.`,
      notYou: "Non hai chiesto di accedere? Puoi ignorare questa email. Nessuno può usare questo codice tranne te.",
    },
    weeklyNewsDigest: {
      kind: "Notizie della settimana",
      subject: ({ platformName }) => `Questa settimana nella ricerca, da ${platformName}`,
      verdict: "Ecco cosa è successo nella ricerca questa settimana.",
      worthKnowing: ({ count }) => (count === 1 ? "cosa da sapere sulla ricerca questa settimana" : "cose da sapere sulla ricerca questa settimana"),
      plainWords: "In parole semplici, e cosa significa ciascuna per i tuoi siti.",
      readOriginal: "Leggi l'originale",
      helpfulHeading: "Contenuti utili",
      openNews: "Apri Notizie",
      seeAll: ({ count, platformName }) => `Vedile tutte e ${count} su ${platformName}`,
      whyYouGetIt: ({ platformName }) => `La ricevi ogni settimana perché usi ${platformName}.`,
      unsubscribe: "Non ricevere più queste email",
    },
    collectionNeedsYou: {
      kind: "Raccolta",
      subject: ({ platformName }) => `${platformName} ha smesso di raccogliere: serve il tuo intervento`,
      verdict: ({ platformName }) => `${platformName} ha smesso di raccogliere e ha bisogno che tu lo faccia ripartire`,
      lede: "È una cosa che solo una persona può sistemare.",
      open: "Apri la pagina della raccolta",
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
