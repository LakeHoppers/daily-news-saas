from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.digest import router
from app.modules.digest.application.latest import DigestRepository
from app.modules.digest.infrastructure.repository import SqlAlchemyDigestRepository
from app.shared.database import build_engine


def create_app(repository: DigestRepository | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = None
        if repository is None:
            engine = build_engine()
            app.state.digest_repository = SqlAlchemyDigestRepository(engine)
        else:
            app.state.digest_repository = repository
        try:
            yield
        finally:
            if engine is not None:
                engine.dispose()

    app = FastAPI(title="Bülten Almanya read API", lifespan=lifespan)
    app.include_router(router)

    @app.exception_handler(SQLAlchemyError)
    async def database_unavailable(request: Request, exc: SQLAlchemyError):
        # Never expose SQL, credentials, connection strings or driver exceptions.
        return JSONResponse({"error": "Digest service unavailable"}, status_code=503)

    return app


app = create_app()
