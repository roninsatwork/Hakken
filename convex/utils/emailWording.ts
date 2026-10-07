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
  /** A Hakken report (hakken-tasks-plan.md, item 4.1, board EmailReportB). */
  taskReport: {
    /** "Monday report", beside the wordmark. */
    kind: (args: { weekday: number }) => string;
    subject: (args: { weekday: number; total: string; pages: number; direction: "lost" | "gained" }) => string;
    /** Under the total: "visitors from Google, across these 5 pages". */
    across: (args: { pages: number }) => string;
    /** "28 September to 4 October, against the 7 days before." */
    span: (args: { from: string; to: string }) => string;
    noneMoved: (args: { direction: "lost" | "gained" }) => string;
    visitorsThen: (args: { count: string }) => string;
    seeAll: string;
    youAsked: (args: { weekday: number; time: string; platformName: string }) => string;
    bellTitle: (args: { weekday: number }) => string;
    bellBody: (args: { change: string; pages: number; direction: "lost" | "gained" }) => string;
  };
  /** A Hakken task's alert, to the person who set it up (hakken-tasks-plan.md, item 1.4). */
  taskAlert: {
    kind: string;
    /** Under the day's figure, as drawn: "7 / visitors from Google on Monday 5 October". */
    visitorsOn: (args: { day: string }) => string;
    shownOn: (args: { day: string }) => string;
    /** "/web-design-london/ usually gets about 23 a day." */
    usually: (args: { what: string; usual: string; measure: "visitors" | "impressions" }) => string;
    /** "You asked me to tell you if it dropped below 10." */
    youAsked: (args: { rule: string }) => string;
    rule: (args: { op: "below" | "above" | "dropBy" | "riseBy"; value: string; days: number }) => string;
    /** The chart, in words, for anyone who cannot see it. */
    chartAlt: (args: { measure: "visitors" | "impressions"; marked: number; quiet: boolean }) => string;
    yourLine: (args: { value: string }) => string;
    usualDay: string;
    quietDays: string;
    busyDays: string;
    settles: (args: { weekday: string; platformName: string }) => string;
    seeWhatHappened: string;
    askWhy: (args: { platformName: string }) => string;
    whyYouGetIt: (args: { platformName: string }) => string;
  };
};

const EN_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const IT_WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
/** "del lunedì", "della domenica": Italian's article for a weekday. */
const itOfWeekday = (weekday: number) => (weekday === 7 ? "della domenica" : IT_WEEKDAYS[weekday - 1] ? `del ${IT_WEEKDAYS[weekday - 1]}` : "della settimana");

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
    taskReport: {
      kind: ({ weekday }) => `${EN_WEEKDAYS[weekday - 1] ?? "Weekly"} report`,
      subject: ({ weekday, total, pages, direction }) =>
        `Your ${EN_WEEKDAYS[weekday - 1] ?? "weekly"} report: ${total} ${direction === "lost" ? "fewer" : "more"} visitors on ${pages} ${pages === 1 ? "page" : "pages"}`,
      across: ({ pages }) => `visitors from Google, across ${pages === 1 ? "this page" : `these ${pages} pages`}`,
      span: ({ from, to }) => `${from} to ${to}, against the 7 days before.`,
      noneMoved: ({ direction }) => (direction === "lost" ? "None of your pages lost visitors from Google" : "None of your pages gained visitors from Google"),
      visitorsThen: ({ count }) => `${count} visitors in these 7 days`,
      seeAll: "See all your pages",
      youAsked: ({ weekday, time, platformName }) =>
        `You asked ${platformName} for this report every ${EN_WEEKDAYS[weekday - 1] ?? "week"} at ${time}. Pause or stop it any time in ${platformName} tasks.`,
      bellTitle: ({ weekday }) => `Your ${EN_WEEKDAYS[weekday - 1] ?? "weekly"} report is ready`,
      bellBody: ({ change, pages, direction }) =>
        pages === 0
          ? (direction === "lost" ? "None of your pages lost visitors this week." : "None of your pages gained visitors this week.")
          : `${change} visitors from Google across ${pages} ${pages === 1 ? "page" : "pages"}.`,
    },
    taskAlert: {
      kind: "Alert",
      visitorsOn: ({ day }) => `visitors from Google on ${day}`,
      shownOn: ({ day }) => `times shown in Google on ${day}`,
      usually: ({ what, usual, measure }) => (measure === "visitors" ? `${what} usually gets about ${usual} a day.` : `${what} usually shows up about ${usual} times a day.`),
      youAsked: ({ rule }) => `You asked me to tell you if it ${rule}.`,
      rule: ({ op, value, days }) => {
        const words = { below: `dropped below ${value}`, above: `went above ${value}`, dropBy: `dropped by ${value}% against a usual day`, riseBy: `rose by ${value}% against a usual day` }[op];
        return days > 1 ? `${words} for ${days} days in a row` : words;
      },
      chartAlt: ({ measure, marked, quiet }) =>
        `${measure === "visitors" ? "Visitors from Google" : "Times shown in Google"} each day for four weeks, with ${marked} ${quiet ? "quiet" : "busy"} ${marked === 1 ? "day" : "days"} marked.`,
      yourLine: ({ value }) => `Your line: ${value}`,
      usualDay: "A usual day",
      quietDays: "Quiet days, last 4 weeks",
      busyDays: "Busy days, last 4 weeks",
      settles: ({ weekday, platformName }) => `Google’s figures take about 3 days to settle, so ${weekday} is the latest full day. You can pause or stop this alert any time in ${platformName} tasks.`,
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
    taskReport: {
      kind: ({ weekday }) => `Report ${itOfWeekday(weekday)}`,
      subject: ({ weekday, total, pages, direction }) =>
        `Il tuo report ${itOfWeekday(weekday)}: ${total} visitatori ${direction === "lost" ? "in meno" : "in più"} su ${pages} ${pages === 1 ? "pagina" : "pagine"}`,
      across: ({ pages }) => `visitatori da Google, ${pages === 1 ? "su questa pagina" : `su queste ${pages} pagine`}`,
      span: ({ from, to }) => `Dal ${from} al ${to}, rispetto ai 7 giorni prima.`,
      noneMoved: ({ direction }) => (direction === "lost" ? "Nessuna delle tue pagine ha perso visitatori da Google" : "Nessuna delle tue pagine ha guadagnato visitatori da Google"),
      visitorsThen: ({ count }) => `${count} visitatori in questi 7 giorni`,
      seeAll: "Vedi tutte le tue pagine",
      youAsked: ({ weekday, time, platformName }) =>
        `Hai chiesto a ${platformName} questo report ogni ${IT_WEEKDAYS[weekday - 1] ?? "settimana"} alle ${time}. Puoi metterlo in pausa o fermarlo quando vuoi in Attività di ${platformName}.`,
      bellTitle: ({ weekday }) => `Il tuo report ${itOfWeekday(weekday)} è pronto`,
      bellBody: ({ change, pages, direction }) =>
        pages === 0
          ? (direction === "lost" ? "Nessuna delle tue pagine ha perso visitatori questa settimana." : "Nessuna delle tue pagine ha guadagnato visitatori questa settimana.")
          : `${change} visitatori da Google su ${pages} ${pages === 1 ? "pagina" : "pagine"}.`,
    },
    taskAlert: {
      kind: "Avviso",
      visitorsOn: ({ day }) => `visitatori da Google ${day}`,
      shownOn: ({ day }) => `volte su Google ${day}`,
      usually: ({ what, usual, measure }) => (measure === "visitors" ? `${what} di solito ha circa ${usual} visitatori al giorno.` : `${what} di solito appare circa ${usual} volte al giorno.`),
      youAsked: ({ rule }) => `Mi hai chiesto di avvisarti se ${rule}.`,
      rule: ({ op, value, days }) => {
        const words = { below: `scendeva sotto ${value}`, above: `superava ${value}`, dropBy: `calava del ${value}% rispetto a un giorno normale`, riseBy: `cresceva del ${value}% rispetto a un giorno normale` }[op];
        return days > 1 ? `${words} per ${days} giorni di fila` : words;
      },
      chartAlt: ({ measure, marked, quiet }) =>
        `${measure === "visitors" ? "Visitatori da Google" : "Volte su Google"} ogni giorno per quattro settimane, con ${marked} ${marked === 1 ? (quiet ? "giorno tranquillo" : "giorno intenso") : (quiet ? "giorni tranquilli" : "giorni intensi")} evidenziati.`,
      yourLine: ({ value }) => `La tua soglia: ${value}`,
      usualDay: "Un giorno normale",
      quietDays: "Giorni tranquilli, ultime 4 settimane",
      busyDays: "Giorni intensi, ultime 4 settimane",
      settles: ({ weekday, platformName }) => `I dati di Google si assestano in circa 3 giorni, quindi ${weekday} è l’ultimo giorno completo. Puoi mettere in pausa o fermare questo avviso quando vuoi in Attività di ${platformName}.`,
      seeWhatHappened: "Guarda cosa è successo",
      askWhy: ({ platformName }) => `Chiedi a ${platformName} perché`,
      whyYouGetIt: ({ platformName }) => `La ricevi perché hai chiesto a ${platformName} di tenerlo d’occhio. Puoi metterlo in pausa o interromperlo quando vuoi in Attività di ${platformName}.`,
    },
  },
};

export function emailWording(language: string): EmailWording {
  return EMAIL_WORDING[language as AppLanguage] ?? EMAIL_WORDING.en;
}
