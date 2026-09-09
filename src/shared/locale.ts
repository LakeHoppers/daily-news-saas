export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export function isLocale(value: unknown): value is Locale {
  return value === "tr" || value === "en";
}
export function localeFromPath(path: string): Locale {
  const segment = path.split("/")[1];
  return isLocale(segment) ? segment : "tr";
}
/** Only old page links are redirected. Machine endpoints and assets never move. */
export function localeRedirect(url: URL): URL | null {
  const target = new URL(url);
  const parts = url.pathname.split("/");
  if (isLocale(parts[1])) {
    if (parts[2] === "admin" && parts[1] !== "tr") target.pathname = url.pathname.replace(/^\/en/, "/tr");
    target.searchParams.delete("lang");
  } else if (/^\/(?:$|dashboard(?:\/|$)|admin(?:\/|$)|sign-in(?:\/|$)|sign-up(?:\/|$))/.test(url.pathname)) {
    const locale = url.searchParams.get("lang") === "en" && parts[1] !== "admin" ? "en" : "tr";
    target.pathname = `/${locale}${url.pathname === "/" ? "" : url.pathname}`;
    target.searchParams.delete("lang");
  }
  return target.href === url.href ? null : target;
}
export function switchLocalePath(path: string, locale: Locale): string {
  return path.replace(/^\/(tr|en)(?=\/|$)/, `/${locale}`);
}
