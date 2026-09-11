import Link from "next/link";
import type { Locale } from "@/shared/locale";
import { SITE_COPY } from "@/shared/site-copy";
export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} News Daily</span>
        <span>{SITE_COPY[locale].footer}</span>
        <Link href={`/${locale}/privacy`} className="hover:text-foreground hover:underline">
          {SITE_COPY[locale].privacyLink}
        </Link>
      </div>
    </footer>
  );
}
