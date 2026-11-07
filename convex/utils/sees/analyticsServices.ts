import type { ServicesAnswer } from "../../googleAnalyticsServiceReads";
import { SERVICE_GROUPS, groupNameInEnglish, openingSplit } from "../serviceGroups";

/**
 * What Services hands its eye (services-new-page-plan-2026-11-07.md, step 6): every service by the page's own names, the most visits
 * first, so the first rows the eye keeps are the ones that matter; the totals worked out over every service, as the eye keeps only a
 * list's first rows; the whole website, the events on other pages, the channels, and the groups as the page opens. Plain code, so the
 * page and the tests build the same figures. The page's own words name each subject (`names`).
 */

/** Services the eye's list holds at most, the busiest first: the totals below count every one. */
const EYE_SERVICES = 25;

export type ServiceEyeNames = Record<string, string>;

export function servicesEyeData(answer: ServicesAnswer, names: ServiceEyeNames, groupNames?: Readonly<Record<string, string>>) {
  const services = answer.services;
  const withVisits = services.filter((service) => service.now.visits > 0);
  const sum = (read: (service: (typeof services)[number]) => number, list = services) => list.reduce((all, service) => all + read(service), 0);
  const split = openingSplit(services, answer.website);
  const groupOf = new Map<string, string>();
  for (const group of SERVICE_GROUPS) for (const service of split.groups[group]) groupOf.set(service.key, groupNames?.[group] ?? groupNameInEnglish(group, split.split));
  const noEvents = withVisits.filter((service) => service.now.events === 0).sort((left, right) => right.now.visits - left.now.visits);
  return {
    names,
    hasBefore: answer.hasBefore,
    services: [...services].sort((left, right) => right.now.visits - left.now.visits).slice(0, EYE_SERVICES).map((service) => ({
      name: service.name,
      visits: service.now.visits,
      ...(answer.hasBefore ? { visitsBefore: service.before.visits } : {}),
      events: service.now.events,
      ...(answer.hasBefore ? { eventsBefore: service.before.events } : {}),
      visitsThatStartedHere: service.started,
      ...(groupOf.has(service.key) ? { group: groupOf.get(service.key) } : {}),
    })),
    allServices: {
      services: withVisits.length,
      visits: sum((service) => service.now.visits, withVisits),
      events: sum((service) => service.now.events, withVisits),
      ...(answer.hasBefore ? { visitsBefore: sum((service) => service.before.visits), eventsBefore: sum((service) => service.before.events) } : {}),
      visitsThatStartedOnAService: sum((service) => service.started),
    },
    website: { visits: answer.website.visits, visitsBefore: answer.website.visitsBefore, events: answer.website.events, eventsBefore: answer.website.eventsBefore },
    noEvents: { services: noEvents.length, of: withVisits.length, busiest: noEvents.slice(0, 5).map((service) => ({ name: service.name, visits: service.now.visits })) },
    elsewhere: { events: answer.elsewhere.events, eventsBefore: answer.elsewhere.eventsBefore, ...(answer.elsewhere.page ? { page: answer.elsewhere.page.name, pageEvents: answer.elsewhere.page.events } : {}) },
    groups: SERVICE_GROUPS.map((group) => ({ name: groupNames?.[group] ?? groupNameInEnglish(group, split.split), services: split.groups[group].length, visits: sum((service) => service.now.visits, split.groups[group]), events: sum((service) => service.now.events, split.groups[group]) })),
    channels: answer.channels.map((channel, at) => ({
      name: channel,
      visits: sum((service) => service.byChannel?.[at]?.[0] ?? 0),
      events: sum((service) => service.byChannel?.[at]?.[2] ?? 0),
      ...(answer.hasBefore ? { visitsBefore: sum((service) => service.byChannel?.[at]?.[3] ?? 0), eventsBefore: sum((service) => service.byChannel?.[at]?.[5] ?? 0) } : {}),
    })),
  };
}
