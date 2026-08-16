import { redirect } from "next/navigation";

/** Saved Answers folded into the Wiki (one-brain-plan.md, phase 3): the
 * save button files answers there with the chat as their receipt. */
export default async function SavedAnswersRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/companies/${id}/ai/pages`);
}
