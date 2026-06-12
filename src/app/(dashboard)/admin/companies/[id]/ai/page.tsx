import { redirect } from "next/navigation";

type CompanyAiIndexPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompanyAiIndexPage({ params }: CompanyAiIndexPageProps) {
  const { id } = await params;

  redirect(`/admin/companies/${id}/ai/knowledge`);
}
