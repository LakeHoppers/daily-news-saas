import Parser from "rss-parser";
import type { FetchedArticle, RssFetcher } from "../domain/types";

export class RealRssFetcher implements RssFetcher {
  private readonly parser = new Parser({
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GermanyDailyBot/0.1)" },
  });

  async fetch(feedUrl: string): Promise<FetchedArticle[]> {
    const feed = await this.parser.parseURL(feedUrl);

    return (feed.items ?? []).map((item) => {
      const externalId = item.guid ?? item.link ?? item.title ?? feedUrl;
      const publishedAtSource = item.isoDate ?? item.pubDate;

      return {
        externalId,
        url: item.link ?? feedUrl,
        title: item.title ?? "(untitled)",
        rawContent: item.contentSnippet ?? item.content ?? item.summary ?? "",
        publishedAt: publishedAtSource ? new Date(publishedAtSource) : null,
      };
    });
  }
}
