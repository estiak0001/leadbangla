from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import app.models  # noqa: F401 — registers every model's mapper before any request runs
from app.api.v1 import api_router
from app.core.config import settings
from app.core.exceptions import PlanLimitError

app = FastAPI(title=settings.app_name)

app.include_router(api_router, prefix="/v1")


@app.exception_handler(PlanLimitError)
async def plan_limit_handler(request: Request, exc: PlanLimitError) -> JSONResponse:
    return JSONResponse(
        status_code=402,
        content={
            "error": "plan_limit_reached",
            "resource": exc.resource,
            "current": exc.current,
            "limit": exc.limit,
            "upgrade_url": "/billing?tab=plan",
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
