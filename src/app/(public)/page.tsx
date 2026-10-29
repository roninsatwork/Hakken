import { getTranslations } from "next-intl/server";
import { HomeScreen } from "./_components/home/HomeScreen";

export default async function HomePage() {
  const t = await getTranslations("landing");
  return <HomeScreen copyright={t("copyright", { year: new Date().getFullYear() })} />;
}
