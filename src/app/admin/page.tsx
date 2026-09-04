import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SourceActiveToggle } from "@/components/admin/source-active-toggle";
import { AddSourceForm } from "@/components/admin/add-source-form";
import { ForceRefreshButton } from "@/components/admin/force-refresh-button";
import { ForbiddenError, requireAdmin } from "@/shared/api-guards";
import { CATEGORY_LABELS_TR } from "@/shared/category-labels";
import { prisma } from "@/shared/prisma";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw err;
  }

  const [sources, pipelineRuns, failedLogs, summaries, auditLogs] = await Promise.all([
    prisma.source.findMany({ orderBy: { name: "asc" } }),
    prisma.pipelineRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.scrapeLog.findMany({
      where: { success: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { source: { select: { name: true } } },
    }),
    prisma.summary.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      distinct: ["storyId"],
      include: { story: { select: { category: true } } },
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { admin: { select: { email: true } } },
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Kaynaklar, pipeline ve özetleri yönet.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ForceRefreshButton />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Başladı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>İstatistik</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipelineRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {run.startedAt.toISOString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={run.status === "SUCCESS" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {run.stats ? JSON.stringify(run.stats) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kaynaklar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AddSourceForm />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Güven</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {source.name}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {source.category ? CATEGORY_LABELS_TR[source.category] : "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {source.trustScore}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.active ? "secondary" : "outline"} className="text-xs">
                      {source.active ? "Aktif" : "Devre dışı"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <SourceActiveToggle sourceId={source.id} active={source.active} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {failedLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Son başarısız taramalar</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Hata</TableHead>
                  <TableHead>Zaman</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{log.source.name}</TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                      {log.error}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.createdAt.toISOString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Son özetler</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Başlık</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((summary) => (
                <TableRow key={summary.id}>
                  <TableCell className="max-w-md truncate">{summary.headline}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {CATEGORY_LABELS_TR[summary.story.category]}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/summaries/${summary.id}`}
                      className="text-sm hover:underline"
                    >
                      Düzenle
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Denetim günlüğü</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Yönetici</TableHead>
                <TableHead>Eylem</TableHead>
                <TableHead>Zaman</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{log.admin.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.createdAt.toISOString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
