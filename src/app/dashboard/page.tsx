import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PreferencesForm } from "@/components/preferences-form";
import { BillingCard } from "@/components/billing-card";
import { getDigestHistory } from "@/modules/digest/infrastructure/digest-view";
import { getOrCreateCurrentUser } from "@/shared/api-guards";
import { CATEGORY_LABELS_TR } from "@/shared/category-labels";
import { prisma } from "@/shared/prisma";

export default async function DashboardPage() {
  const user = await getOrCreateCurrentUser();
  const favoriteCategories = user.preference?.favoriteCategories ?? [];
  const [history, subscription] = await Promise.all([
    getDigestHistory(favoriteCategories, 14),
    prisma.subscription.findUnique({ where: { userId: user.id } }),
  ]);
  const plan = subscription?.plan ?? "FREE";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hesabım</h1>
        <p className="text-muted-foreground">
          Hangi kategorilerin özetini görmek istediğini seç.
        </p>
      </div>

      <Card>
        <CardContent>
          <BillingCard plan={plan} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Favori kategoriler</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesForm initialFavoriteCategories={favoriteCategories} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Geçmiş özetler</h2>
        {history.length === 0 || history.every((d) => d.items.length === 0) ? (
          <p className="text-sm text-muted-foreground">
            Henüz gösterilecek bir özet yok.
          </p>
        ) : (
          history
            .filter((digest) => digest.items.length > 0)
            .map((digest) => (
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
                        {CATEGORY_LABELS_TR[item.category]}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
        )}
      </div>
    </main>
  );
}
