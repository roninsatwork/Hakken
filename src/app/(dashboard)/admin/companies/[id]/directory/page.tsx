import { redirect } from "next/navigation";

type CompanyDirectoryIndexPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompanyDirectoryIndexPage({ params }: CompanyDirectoryIndexPageProps) {
  const { id } = await params;

  redirect(`/admin/companies/${id}/directory/users`);
}
