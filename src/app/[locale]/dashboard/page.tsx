import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PreferencesForm } from "@/components/preferences-form";
import { BillingCard } from "@/components/billing-card";
import { getDigestHistory } from "@/modules/digest/infrastructure/digest-view";
import { getOrCreateCurrentUser } from "@/shared/api-guards";
import { CATEGORY_LABELS } from "@/shared/category-labels";
import { prisma } from "@/shared/prisma";

import { isLocale } from "@/shared/locale";
import { SITE_COPY } from "@/shared/site-copy";
import { notFound } from "next/navigation";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = SITE_COPY[locale];
  const user = await getOrCreateCurrentUser();
  const favoriteCategories = user.preference?.favoriteCategories ?? [];
  const [history, subscription] = await Promise.all([
    getDigestHistory(favoriteCategories, 14, locale),
    prisma.subscription.findUnique({ where: { userId: user.id } }),
  ]);
  const plan = subscription?.plan ?? "FREE";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.account}</h1>
        <p className="text-muted-foreground">
          {copy.choose}
        </p>
      </div>

      <Card>
        <CardContent>
          <BillingCard plan={plan} locale={locale} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.favorites}</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesForm initialFavoriteCategories={favoriteCategories} plan={plan} locale={locale} />
        </CardContent>
      </Card>

      {(() => {
        const pastDigests = history.filter((digest) => digest.items.length > 0);
        return (
          <details className="group flex flex-col gap-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-lg font-semibold tracking-tight">
              {copy.history}
              {pastDigests.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({pastDigests.length})
                </span>
              )}
              <span className="text-muted-foreground transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            {pastDigests.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy.empty}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {pastDigests.map((digest) => (
                  <Card key={digest.date}>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">
                        {digest.date}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      {digest.items.map((item) => (
                        <div
                          key={item.storyId}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <span>{item.headline}</span>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            {CATEGORY_LABELS[locale][item.category]}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </details>
        );
      })()}
    </main>
  );
}
