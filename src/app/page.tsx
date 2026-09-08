import type { CSSProperties } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getHomeDigest } from "@/shared/home-digest";
import { CATEGORY_LABELS_EN, CATEGORY_LABELS_TR } from "@/shared/category-labels";
import { CATEGORY_ACCENT } from "@/shared/category-colors";
import { HOME_COPY } from "@/shared/home-copy";
import type { Locale } from "@/modules/digest/domain/localize";

function formatDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const locale: Locale = (await searchParams).lang === "en" ? "en" : "tr";
  const digest = await getHomeDigest(locale);
  const copy = HOME_COPY[locale];
  const categoryLabels = locale === "en" ? CATEGORY_LABELS_EN : CATEGORY_LABELS_TR;

  return (
    <main
      lang={locale}
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-14 sm:py-20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/50" />
            {copy.tagline}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs font-medium tracking-wide uppercase">
            <Link
              href="/"
              className={locale === "tr" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}
            >
              TR
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <Link
              href="/?lang=en"
              className={locale === "en" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}
            >
              EN
            </Link>
          </div>
        </div>
        <h1 className="font-heading text-4xl leading-[1.1] font-medium text-balance sm:text-5xl">
          {copy.title}
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
          {copy.description}
        </p>
      </div>

      {!digest || digest.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{copy.emptyTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{copy.emptyBody}</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center gap-3 border-y py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span>{formatDate(digest.date, locale)}</span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span>{copy.storiesLabel(digest.items.length)}</span>
          </div>

          {digest.items.map((item, index) => (
            <article
              key={item.storyId}
              style={{ "--cat": CATEGORY_ACCENT[item.category] } as CSSProperties}
              className="flex flex-col gap-3 border-b py-8 last:border-0"
            >
              <div className="flex items-baseline gap-2.5">
                <span className="font-heading text-sm text-muted-foreground/60 tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--cat)] uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--cat)]" />
                  {categoryLabels[item.category]}
                </span>
              </div>

              <h2
                className={`font-heading leading-snug font-medium text-balance ${
                  index === 0 ? "text-2xl sm:text-3xl" : "text-xl"
                }`}
              >
                {item.headline}
              </h2>

              <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90">
                {item.summary
                  .split("\n")
                  .filter((paragraph) => paragraph.trim().length > 0)
                  .map((paragraph, i) => (
                    <p key={i} className="text-pretty">
                      {paragraph}
                    </p>
                  ))}
              </div>

              <div
                className="border-l-2 pl-4 text-sm leading-relaxed text-foreground/80"
                style={{ borderColor: "var(--cat)" }}
              >
                <span className="font-semibold text-foreground">{copy.whyItMatters}</span>
                {item.whyItMatters}
              </div>

              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[11px] font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {item.sourceUrls.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                  {item.sourceUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground hover:underline"
                    >
                      {new URL(url).hostname.replace(/^www\./, "")}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
