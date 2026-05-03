import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import create_tables, migrate_tables
from seed import seed
from routers import medicines, grocery, sales, discounts, audit, reports, search
from routers.backup import router as backup_router, start_scheduler, stop_scheduler
from routers.business import router as business_router
from routers.system import router as system_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    migrate_tables()
    seed()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="PharmaPOS API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# All API routes live under /api so they don't conflict with SPA client-side routes.
app.include_router(medicines.router,   prefix="/api")
app.include_router(grocery.router,     prefix="/api")
app.include_router(sales.router,       prefix="/api")
app.include_router(discounts.router,   prefix="/api")
app.include_router(audit.router,       prefix="/api")
app.include_router(reports.router,     prefix="/api")
app.include_router(search.router,      prefix="/api")
app.include_router(backup_router,      prefix="/api")
app.include_router(business_router,    prefix="/api")
app.include_router(system_router,      prefix="/api")


@app.get("/api/version")
def get_version():
    base = os.environ.get("PHARMAPOS_BASE_DIR", str(Path(__file__).parent.parent))
    p = Path(base) / "version.txt"
    return {"version": p.read_text().strip() if p.exists() else "dev"}


# Serve built React app in production.
# In frozen mode (PyInstaller), PHARMAPOS_BASE_DIR points to the _MEIPASS bundle.
_base = os.environ.get("PHARMAPOS_BASE_DIR", os.path.join(os.path.dirname(__file__), ".."))
STATIC_DIR = os.path.join(_base, "frontend", "dist")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
