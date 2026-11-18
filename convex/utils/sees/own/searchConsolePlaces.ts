import { isNumber, isRow, moved, named, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { changeOf, fairBefore, namesOf, shareMoved } from "./searchConsoleShared";

// ---------------------------------------------------------------------------
// Countries and devices
// ---------------------------------------------------------------------------

/** A country's clicks that moved fewer than this aren't news, whatever the share: as Pages' pages (`PAGE_MOVED_LEAST`). */
const COUNTRY_MOVED_LEAST = 5;

/**
 * Countries and devices (search-console-countries-and-devices-way-1-plan-2026-11-18.md): every country Google showed the
 * website in, with the four boxes, the devices and the chart all following the country chosen in the menu. From what the
 * page hands its eye (`placesPageData`), against the dates before where that span is fair:
 *
 * - the country chosen's share of every click, the page's headline;
 * - the countries abroad that gained and lost most clicks, over the whole list;
 * - each device's share of the country chosen's clicks: the busiest, and the one whose share moved most;
 * - each country ticked onto the chart, its clicks;
 * - how many countries sent a click.
 *
 * Where the dates have no fair span before (More Handles' Last 6 and 12 months: Google has no figures for it from
 * 11 August 2025 to 22 April 2026), the shares are said as they stand, and nothing is said to have moved.
 */
export function placesFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const chosen = isRow(data.chosen) ? data.chosen : null;
  const others = isRow(data.others) ? data.others : null;
  const chosenName = chosen ? named(chosen) : null;
  if (!chosen || !chosenName || !isNumber(chosen.clicks) || !others || !isNumber(others.clicks)) return found;
  const total = chosen.clicks + others.clicks;
  const totalBefore = isNumber(chosen.clicksBefore) && isNumber(others.clicksBefore) ? chosen.clicksBefore + others.clicksBefore : null;
  const fair = totalBefore !== null && fairBefore(total, totalBefore);

  // The headline: the country chosen's share of every country's clicks, against its share before.
  if (total > 0) {
    const share = (100 * chosen.clicks) / total;
    if (fair && isNumber(chosen.clicksBefore)) {
      const before = (100 * chosen.clicksBefore) / (totalBefore as number);
      found.push(shareMoved("share", chosenName, "clicks", share, before, 1.5 + Math.min(0.4, Math.abs(share - before) / 10)));
    } else {
      found.push(partOf("share", chosenName, "clicks", chosen.clicks, total, 1.5));
    }
  }

  // The countries abroad that gained and lost most clicks, over every country, each shown in the span before too.
  const movers = isRow(data.movers) ? data.movers : {};
  if (fair) {
    for (const way of ["up", "down"] as const) {
      const one = isRow(movers[way]) ? (movers[way] as Row) : null;
      const name = one ? named(one) : null;
      if (!one || !name || !isNumber(one.clicks) || !isNumber(one.previousClicks) || one.previousClicks <= 0) continue;
      const change = one.clicks - one.previousClicks;
      if (Math.abs(change) < COUNTRY_MOVED_LEAST) continue;
      found.push(moved(`abroad.${way}`, name, "clicks", one.clicks, one.previousClicks, 1.0 + Math.min(0.4, (Math.abs(change) / Math.max(1, others.clicks)) * 4)));
    }
  }

  // Each device's share of the country chosen's clicks, named with the country ("Mobile in the United Kingdom"), and said
  // as a share of that country's clicks (`deviceClicks`), never of every country's, which the headline is.
  const deviceNames = isRow(names.devices) ? names.devices : {};
  const devices = rowsOf(data.devices).filter((row) => named(row) && isNumber(row.clicks));
  const deviceClicks = devices.reduce((sum, row) => sum + (row.clicks as number), 0);
  const deviceBefore = devices.length > 0 && devices.every((row) => isNumber(row.previousClicks)) ? devices.reduce((sum, row) => sum + (row.previousClicks as number), 0) : null;
  const devicesFair = deviceBefore !== null && fairBefore(deviceClicks, deviceBefore);
  // The busiest device, as its table opens, and of the rest the one whose share moved most: two, so the devices never
  // crowd out the countries.
  if (devices.length > 1 && deviceClicks > 0) {
    const shareOf = (device: Row) => (100 * (device.clicks as number)) / deviceClicks;
    const shareBeforeOf = (device: Row) => (devicesFair ? (100 * (device.previousClicks as number)) / (deviceBefore as number) : null);
    const moveOf = (device: Row) => { const before = shareBeforeOf(device); return before === null ? 0 : Math.abs(shareOf(device) - before); };
    const [busiest, ...rest] = [...devices].sort((left, right) => (right.clicks as number) - (left.clicks as number));
    const next = devicesFair ? [...rest].sort((left, right) => moveOf(right) - moveOf(left))[0] : rest[0];
    for (const [device, first] of [[busiest, 0.2], [next, 0]] as Array<[Row | undefined, number]>) {
      if (!device || (device.clicks as number) <= 0 && !devicesFair) continue;
      const name = typeof deviceNames[String(device.key)] === "string" ? (deviceNames[String(device.key)] as string) : named(device)!;
      const before = shareBeforeOf(device);
      if (before !== null) found.push(shareMoved("device", name, "deviceClicks", shareOf(device), before, 0.8 + first + Math.min(0.45, moveOf(device) / 5)));
      else found.push(partOf("device", name, "deviceClicks", device.clicks as number, deviceClicks, 0.8 + first));
    }
  }

  // Each country ticked onto the chart, its clicks against the span before: the ones the reader asked about. A country
  // already said above isn't said twice.
  const said = new Set(found.map((one) => String(one.params.name)));
  const ticked = fair
    ? rowsOf(data.ticked)
      .filter((row) => named(row) && !said.has(named(row)!) && isNumber(row.clicks) && isNumber(row.previousClicks) && row.previousClicks > 0
        && Math.abs((row.clicks as number) - row.previousClicks) >= COUNTRY_MOVED_LEAST)
      .sort((left, right) => Math.abs(changeOf(right.clicks as number, right.previousClicks as number)) - Math.abs(changeOf(left.clicks as number, left.previousClicks as number)))
    : [];
  ticked.forEach((row, at) => {
    const [now, then] = [row.clicks as number, row.previousClicks as number];
    found.push(moved("ticked", named(row)!, "clicks", now, then, (at === 0 ? 1.25 : 0.7) + Math.min(0.3, Math.abs(changeOf(now, then)) / 2)));
  });

  // How many countries sent a click, against the span before; else out of every country Google showed the website in.
  const clicked = isRow(data.clicked) ? data.clicked : null;
  const clickedName = clicked ? named(clicked) : null;
  if (clicked && clickedName && isNumber(clicked.countries) && isNumber(clicked.of) && clicked.of > 0) {
    if (fair && isNumber(clicked.countriesBefore) && clicked.countriesBefore > 0 && clicked.countries !== clicked.countriesBefore) {
      found.push(moved("clicked", clickedName, "countries", clicked.countries, clicked.countriesBefore, 0.95 + Math.min(0.4, Math.abs(changeOf(clicked.countries, clicked.countriesBefore)))));
    } else if (clicked.countries > 0) {
      found.push(partOf("clicked", clickedName, "countries", clicked.countries, clicked.of, 0.95));
    }
  }
  return found;
}
