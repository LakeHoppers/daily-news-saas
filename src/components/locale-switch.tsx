"use client";
import { usePathname } from "next/navigation";
import { switchLocalePath, type Locale } from "@/shared/locale";
export function LocaleSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  if (/^\/tr\/admin(?:\/|$)/.test(pathname)) return null;
  return <nav aria-label={locale === "en" ? "Language" : "Dil"} className="flex gap-1 text-xs">
    {(["tr", "en"] as const).map((next) => (
      // Full navigation also resets Clerk's locale and any open account modal.
      <a key={next} href={switchLocalePath(pathname, next)} hrefLang={next}
        aria-current={locale === next ? "page" : undefined}
        className={locale === next ? "font-semibold" : "text-muted-foreground"}>{next.toUpperCase()}</a>
    ))}
  </nav>;
}
