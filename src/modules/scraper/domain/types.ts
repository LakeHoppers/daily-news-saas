export interface FetchedArticle {
  externalId: string;
  url: string;
  title: string;
  rawContent: string;
  publishedAt: Date | null;
}

export interface RssFetcher {
  fetch(feedUrl: string): Promise<FetchedArticle[]>;
}
