from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.common.health import router as health_router
from app.config import settings
from app.database import close_mongo_connection, connect_to_mongo
from app.routers import (
    dfc_router,
    gas_monitor_router,
    nft_router,
    risk_router,
    score_router,
    sherlock_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager for application lifespan events.
    Handles startup (DB connection) and shutdown (DB disconnection).
    """
    await connect_to_mongo()
    yield
    await close_mongo_connection()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend para a infraestrutura de reputação digital FoundLab",
    debug=settings.DEBUG,
    lifespan=lifespan,
)

# Include routers
app.include_router(health_router, prefix="", tags=["Monitoring"])
app.include_router(score_router.router, prefix="/scores", tags=["ScoreLab"])
app.include_router(dfc_router.router, prefix="/flags", tags=["DFC"])
app.include_router(sherlock_router.router, prefix="/sherlock", tags=["Sherlock"])
app.include_router(nft_router.router, prefix="/nft", tags=["SigilMesh"])
app.include_router(risk_router.router, prefix="/sentinela", tags=["Sentinela"])
app.include_router(gas_monitor_router.router, prefix="/gasmonitor", tags=["GasMonitor"])
app.include_router(cryptopix_analyzer.router, prefix="cryptopix_analyzer", tags=["cryptopix_analyzer"])
