import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getHomeDigest } from "@/shared/home-digest";
import { CATEGORY_LABELS_TR } from "@/shared/category-labels";

function formatTurkishDate(isoDate: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

export default async function Home() {
  const digest = await getHomeDigest();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <Badge variant="secondary" className="w-fit">
          MVP altyapısı kuruluyor
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Almanya&apos;dan her sabah, Türkçe özet.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Bülten Almanya; en önemli Alman haberlerini toplar, tekrarları
          ayıklar, önem sırasına koyar ve akıcı Türkçe özetler halinde neden
          önemli olduğunu anlatır.
        </p>
      </div>

      {!digest || digest.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bugünkü özet henüz yok</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Haber toplama ve özetleme hattı henüz devreye alınmadı. İlk özet
            burada görünecek.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            {formatTurkishDate(digest.date)} özeti · {digest.items.length} haber
          </h2>
          {digest.items.map((item) => (
            <Card key={item.storyId}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <CardTitle className="text-lg font-semibold leading-snug">
                  {item.headline}
                </CardTitle>
                <Badge variant="outline" className="shrink-0">
                  {CATEGORY_LABELS_TR[item.category]}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 text-sm text-foreground">
                  {item.summary
                    .split("\n")
                    .filter((paragraph) => paragraph.trim().length > 0)
                    .map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                </div>

                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="font-medium">Neden önemli: </span>
                  {item.whyItMatters}
                </div>

                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {item.sourceUrls.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {item.sourceUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {new URL(url).hostname.replace(/^www\./, "")}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
