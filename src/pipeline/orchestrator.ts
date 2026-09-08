import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/prisma";
import { FetchArticlesUseCase } from "@/modules/scraper/application/fetch-articles.use-case";
import { PrismaScraperRepository } from "@/modules/scraper/infrastructure/prisma-scraper-repository";
import { RealRssFetcher } from "@/modules/scraper/infrastructure/rss-fetcher";
import { ClusterArticlesUseCase } from "@/modules/dedup/application/cluster-articles.use-case";
import { PrismaDedupRepository } from "@/modules/dedup/infrastructure/prisma-dedup-repository";
import { OpenAIEmbedder } from "@/modules/ai/providers/openai-embedder";
import { RankStoriesUseCase } from "@/modules/ranking/application/rank-stories.use-case";
import { PrismaRankingRepository } from "@/modules/ranking/infrastructure/prisma-ranking-repository";
import { SummarizeStoryUseCase } from "@/modules/ai/summarizer/application/summarize-story.use-case";
import { PrismaSummarizerRepository } from "@/modules/ai/summarizer/infrastructure/prisma-summarizer-repository";
import { OpenAIFactExtractor } from "@/modules/ai/providers/openai-fact-extractor";
import { OpenAISummarizer, OPENAI_SUMMARIZER_MODEL } from "@/modules/ai/providers/openai-summarizer";
import { BuildDigestUseCase } from "@/modules/digest/application/build-digest.use-case";
import { PrismaDigestRepository } from "@/modules/digest/infrastructure/prisma-digest-repository";

export interface PipelineRunSummary {
  pipelineRunId: string;
  fetch: { succeeded: number; failed: number; articlesFetched: number };
  cluster: { embedded: number; failed: number; attachedToExisting: number; newStories: number };
  rank: { ranked: number };
  summarize: { summarized: number; failed: number };
  digest: { digestId: string; itemCount: number };
}

export async function runPipeline(): Promise<PipelineRunSummary> {
  const run = await prisma.pipelineRun.create({ data: {} });

  try {
    const fetchResult = await new FetchArticlesUseCase(
      new PrismaScraperRepository(),
      new RealRssFetcher(),
    ).execute(run.id);

    const clusterResult = await new ClusterArticlesUseCase(
      new PrismaDedupRepository(),
      new OpenAIEmbedder(),
    ).execute();

    const rankResult = await new RankStoriesUseCase(
      new PrismaRankingRepository(),
    ).execute(clusterResult.touchedStoryIds);

    const summarizeResult = await new SummarizeStoryUseCase(
      new PrismaSummarizerRepository(),
      new OpenAIFactExtractor(),
      new OpenAISummarizer(),
      "openai",
      OPENAI_SUMMARIZER_MODEL,
    ).execute();

    const digestResult = await new BuildDigestUseCase(new PrismaDigestRepository()).execute();

    const totalFailed = fetchResult.failed + clusterResult.failed + summarizeResult.failed;
    const status =
      fetchResult.succeeded === 0
        ? "FAILED"
        : totalFailed === 0
          ? "SUCCESS"
          : "PARTIAL_FAILURE";

    const stats = {
      fetch: fetchResult,
      cluster: {
        embedded: clusterResult.embedded,
        failed: clusterResult.failed,
        attachedToExisting: clusterResult.attachedToExisting,
        newStories: clusterResult.newStories,
      },
      rank: rankResult,
      summarize: summarizeResult,
      digest: digestResult,
    };

    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), stats: stats as unknown as Prisma.InputJsonValue },
    });

    return { pipelineRunId: run.id, ...stats };
  } catch (err) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        stats: { error: err instanceof Error ? err.message : String(err) },
      },
    });
    throw err;
  }
}
