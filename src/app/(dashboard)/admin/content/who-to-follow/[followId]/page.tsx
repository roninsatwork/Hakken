"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { PersonPage } from "../PersonPage";

/** Admin → Content → Who to follow → a person: their channels and what they published (content-people-knowledge-plan.md, board 2). */
export default function FollowPersonPage() {
  const params = useParams();
  return <PersonPage followId={params.followId as Id<"newsFollows">} />;
}
