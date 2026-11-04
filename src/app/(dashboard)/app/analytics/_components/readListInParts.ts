/** Times a download starts its list again when the list keeps changing under it, before saying it could not. */
const MOST_READINGS = 3;

type ReadPart<Row> = (part: number) => Promise<{ rows: Row[]; total: number }>;

/** A part asked for again if it fails once: a big website's read uses most of a query's second, so one can run over. */
async function partOf<Row>(read: ReadPart<Row>, part: number): Promise<{ rows: Row[]; total: number }> {
  try {
    return await read(part);
  } catch {
    return await read(part);
  }
}

/** One reading of the list, part by part; null when the list changed under it, when a part would repeat or miss rows. */
async function oneReading<Row>(read: ReadPart<Row>): Promise<Row[] | null> {
  const first = await partOf(read, 0);
  const rows = [...first.rows];
  for (let part = 1; rows.length < first.total; part += 1) {
    const next = await partOf(read, part);
    if (next.total !== first.total || next.rows.length === 0) return null;
    rows.push(...next.rows);
  }
  return rows;
}

/**
 * Every row of a list, read a part at a time (`analyticsListAll`): a big website's whole list is too long for one
 * query's answer. A collection finishing during the reading can change the list, so the reading then starts again.
 */
export async function readListInParts<Row>(read: ReadPart<Row>): Promise<Row[]> {
  for (let reading = 0; reading < MOST_READINGS; reading += 1) {
    const rows = await oneReading(read);
    if (rows) return rows;
  }
  throw new Error("The list kept changing while it was read.");
}
