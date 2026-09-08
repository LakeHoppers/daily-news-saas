import type { Locale } from "@/modules/digest/domain/localize";

export const HOME_COPY: Record<
  Locale,
  {
    tagline: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyBody: string;
    whyItMatters: string;
    storiesLabel: (count: number) => string;
  }
> = {
  tr: {
    tagline: "Otomatik. Her sabah. Güvenilir.",
    title: "Almanya'dan her sabah, Türkçe özet.",
    description:
      "News Daily; en önemli Alman haberlerini toplar, tekrarları ayıklar, önem sırasına koyar ve akıcı Türkçe özetler halinde neden önemli olduğunu anlatır.",
    emptyTitle: "Bugünkü özet henüz yok",
    emptyBody:
      "Haber toplama ve özetleme hattı henüz devreye alınmadı. İlk özet burada görünecek.",
    whyItMatters: "Neden önemli — ",
    storiesLabel: (count) => `${count} haber`,
  },
  en: {
    tagline: "Automatic. Every morning. Reliable.",
    title: "The most important German news, every morning.",
    description:
      "News Daily collects the most important German news, removes duplicates, ranks them by importance, and explains why each one matters in a fluent daily summary.",
    emptyTitle: "No digest yet today",
    emptyBody: "The collection and summarization pipeline hasn't run yet. The first digest will appear here.",
    whyItMatters: "Why it matters — ",
    storiesLabel: (count) => `${count} stories`,
  },
};
