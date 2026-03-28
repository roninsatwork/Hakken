import Link from "next/link";
import Typography from "../atoms/typography";
import { useTranslations } from "next-intl";

export default function Header() {
  const t = useTranslations();

  return (
    <header>
      <div className="flex items-center justify-between px-4 py-2">
        <Link href="/">
          <Typography>{t('projectName')}</Typography>
        </Link>
      </div>
    </header>
  );
}