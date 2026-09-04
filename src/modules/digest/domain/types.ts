import type { Category } from "@/generated/prisma/enums";

export interface DigestItemView {
  rank: number;
  storyId: string;
  category: Category;
  headline: string;
  summary: string;
  whyItMatters: string;
  tags: string[];
  sourceUrls: string[];
}

export interface DigestView {
  digestId: string;
  date: string;
  items: DigestItemView[];
}
