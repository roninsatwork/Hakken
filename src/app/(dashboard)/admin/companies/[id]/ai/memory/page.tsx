import { redirect } from "next/navigation";

/** Memory folded into the Wiki (one-brain-plan.md, phase 3): facts live
 * as pinned corrections, instructions as AI Rules. */
export default async function MemoryRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/companies/${id}/ai/pages`);
}
