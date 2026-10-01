"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { GoogleUpdateEditor } from "../GoogleUpdateEditor";

/** Admin → Content → Google updates → an update, on its own page. */
export default function EditGoogleUpdatePage() {
  const params = useParams();
  return <GoogleUpdateEditor updateId={params.updateId as Id<"googleUpdates">} />;
}
