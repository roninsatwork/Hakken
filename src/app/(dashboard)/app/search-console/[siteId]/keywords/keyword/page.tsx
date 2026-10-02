"use client";

import { SearchConsoleRecordScreen } from "../../../_components/SearchConsoleRecordScreen";

/** One keyword's own screen: its days, where its clicks came from, and the pages it brought people to. */
export default function SearchConsoleKeywordPage() {
  return <SearchConsoleRecordScreen dimension="query" />;
}
