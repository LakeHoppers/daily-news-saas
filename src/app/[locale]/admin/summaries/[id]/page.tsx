import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryEditForm } from "@/components/admin/summary-edit-form";
import { ForbiddenError, requireAdmin } from "@/shared/api-guards";
import { prisma } from "@/shared/prisma";

export default async function AdminSummaryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      redirect("/tr/dashboard");
    }
    throw err;
  }

  const { id } = await params;
  const summary = await prisma.summary.findUnique({ where: { id } });
  if (!summary) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Özeti düzenle</h1>
        <p className="text-sm text-muted-foreground">
          Sürüm {summary.version} — kaydetmek yeni bir sürüm oluşturur, mevcut sürümü değiştirmez.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{summary.headline}</CardTitle>
        </CardHeader>
        <CardContent>
          <SummaryEditForm
            summaryId={summary.id}
            initial={{
              headline: summary.headline,
              body: summary.body,
              whyItMatters: summary.whyItMatters,
              tags: summary.tags,
            }}
          />
        </CardContent>
      </Card>
    </main>
  );
}
