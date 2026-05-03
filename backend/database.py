import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase


def _db_path() -> str:
    # When frozen by PyInstaller, store data in a user-writable directory
    # set by the launcher; otherwise use a path relative to this file.
    data_dir = os.environ.get("PHARMAPOS_DATA_DIR")
    if data_dir:
        Path(data_dir).mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{Path(data_dir) / 'pharmacy.db'}"
    return "sqlite:///./pharmacy.db"


DATABASE_URL = _db_path()

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    import models  # noqa: F401 — side-effect import registers all ORM models
    Base.metadata.create_all(bind=engine)


def migrate_tables():
    """Add new columns to existing tables without dropping data (SQLite-safe)."""
    with engine.connect() as conn:
        sales_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(sales)"))}
        if "payment_app" not in sales_cols:
            conn.execute(text("ALTER TABLE sales ADD COLUMN payment_app TEXT"))
        if "payment_ref" not in sales_cols:
            conn.execute(text("ALTER TABLE sales ADD COLUMN payment_ref TEXT"))

        med_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(medicines)"))}
        if "is_deleted" not in med_cols:
            conn.execute(text("ALTER TABLE medicines ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0"))

        groc_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(grocery_items)"))}
        if "is_deleted" not in groc_cols:
            conn.execute(text("ALTER TABLE grocery_items ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0"))

        conn.commit()
