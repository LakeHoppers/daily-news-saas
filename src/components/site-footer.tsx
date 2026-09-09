import type { Locale } from "@/shared/locale";
import { SITE_COPY } from "@/shared/site-copy";
export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-3 items-center justify-between px-4 py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} News Daily</span>
        <span>{SITE_COPY[locale].footer}</span>
      </div>
    </footer>
  );
}
