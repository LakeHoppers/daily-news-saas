from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.digest import router
from app.modules.digest.application.latest import DigestRepository
from app.modules.digest.infrastructure.repository import SqlAlchemyDigestRepository
from app.shared.database import build_engine


def create_app(
    repository: DigestRepository | None = None,
    *,
    verifier=None,
    user_repository=None,
    workspace=None,
    billing=None,
    webhook_secret="",
    email_sender=None,
    cron_secret="",
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = None
        if repository is None:
            engine = build_engine()
            app.state.digest_repository = SqlAlchemyDigestRepository(engine)
        else:
            app.state.digest_repository = repository
        if verifier is not None:
            from app.modules.user.infrastructure.repository import SqlAlchemyUserRepository

            app.state.verifier = verifier
            app.state.user_repository = (
                user_repository or workspace or SqlAlchemyUserRepository(engine)
            )
            app.state.workspace = workspace
            app.state.billing = billing
            app.state.webhook_secret = webhook_secret
            app.state.email_sender = email_sender
            app.state.cron_secret = cron_secret
        try:
            yield
        finally:
            if engine is not None:
                engine.dispose()

    app = FastAPI(title="News Daily read API", lifespan=lifespan)
    app.include_router(router)
    if verifier is not None:
        from app.api.protected import router as protected_router

        app.include_router(protected_router)
        from app.api.admin import router as admin_router

        app.include_router(admin_router)
        from app.api.billing import router as billing_router

        app.include_router(billing_router)
        from app.api.delivery import router as delivery_router

        app.include_router(delivery_router)

    @app.exception_handler(HTTPException)
    async def api_error(request: Request, exc: HTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(ValueError)
    async def invalid_data(request: Request, exc: ValueError):
        return JSONResponse({"error": "Invalid request data"}, status_code=400)

    from app.shared.state import ConflictError, MissingError

    @app.exception_handler(MissingError)
    async def missing(request: Request, exc: MissingError):
        return JSONResponse({"error": str(exc)}, status_code=404)

    @app.exception_handler(ConflictError)
    async def conflict(request: Request, exc: ConflictError):
        return JSONResponse({"error": str(exc)}, status_code=409)

    @app.exception_handler(SQLAlchemyError)
    async def database_unavailable(request: Request, exc: SQLAlchemyError):
        # Never expose SQL, credentials, connection strings or driver exceptions.
        return JSONResponse({"error": "Digest service unavailable"}, status_code=503)

    return app


app = create_app()
