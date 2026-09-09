from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.protected import admin, workspace
from app.modules.admin.application.service import AdminService
from app.modules.user.domain.models import UserIdentity

router = APIRouter()
Admin = Annotated[UserIdentity, Depends(admin)]


def service(request):
    return AdminService(workspace(request))


@router.get("/api/admin/sources")
def sources(request: Request, user: Admin):
    return {"sources": service(request).sources()}


@router.post("/api/admin/sources", status_code=201)
def create_source(request: Request, body: dict, user: Admin):
    return service(request).save_source(user.user.id, body)


@router.patch("/api/admin/sources/{source_id}")
def edit_source(source_id: str, request: Request, body: dict, user: Admin):
    return service(request).save_source(user.user.id, body, source_id)


@router.patch("/api/admin/summaries/{summary_id}")
def edit_summary(summary_id: str, request: Request, body: dict, user: Admin):
    return service(request).edit_summary(user.user.id, summary_id, body)


def bounded(value, maximum):
    if value < 1:
        raise HTTPException(400, "limit must be positive")
    return min(value, maximum)


@router.get("/api/admin/pipeline/runs")
def runs(request: Request, user: Admin, limit: int = 20, status: str | None = None):
    return {"runs": service(request).logs("runs", bounded(limit, 100), status=status)}


@router.get("/api/admin/scrape-logs")
def scrapes(
    request: Request,
    user: Admin,
    limit: int = 50,
    sourceId: str | None = None,
    success: str | None = None,
):
    return {
        "logs": service(request).logs(
            "scrapeLogs",
            bounded(limit, 200),
            source_id=sourceId,
            success=True if success == "true" else False if success == "false" else None,
        )
    }


@router.get("/api/admin/audit-logs")
def audits(request: Request, user: Admin, limit: int = 50):
    return {"logs": service(request).logs("auditLogs", bounded(limit, 200))}


@router.post("/api/admin/pipeline/run", status_code=202)
async def run_pipeline(request: Request, user: Admin):
    from app.modules.admin.infrastructure.local_pipeline import LocalPipeline

    return await LocalPipeline(workspace(request)).run(user.user.id)
