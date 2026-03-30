import os

from sqlalchemy import create_engine, Column, Integer, String, Text, UniqueConstraint, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class DraftConfig(Base):
    __tablename__ = "draft_configs"

    id = Column(Integer, primary_key=True, index=True)
    layout_name = Column(String, index=True, nullable=False)
    pdf_filename_keyword = Column(String, index=True, nullable=False)
    company_name = Column(String, nullable=True)
    department = Column(String, nullable=True)
    name = Column(String, nullable=True)
    honorific = Column(String, default="様")
    to_email = Column(String, nullable=True)
    cc_email = Column(String, nullable=True)
    body_template = Column(Text, nullable=True)

    # layout_name と pdf_filename_keyword の組み合わせを一意にする
    __table_args__ = (
        UniqueConstraint('layout_name', 'pdf_filename_keyword', name='_layout_keyword_uc'),
    )

class LayoutSetting(Base):
    __tablename__ = "layout_settings"

    id = Column(Integer, primary_key=True, index=True)
    layout_name = Column(String, unique=True, index=True, nullable=False)
    sender_email = Column(String, nullable=True)
    draft_subject = Column(String, nullable=True)

def _resolve_database_url() -> str:
    """Prefer DATABASE_URL; else SQLite. Use SQLITE_PATH for a persistent file (e.g. Railway volume)."""
    explicit = os.environ.get("DATABASE_URL", "").strip()
    if explicit:
        return explicit
    sqlite_path = os.environ.get("SQLITE_PATH", "pdftodraft.db").strip() or "pdftodraft.db"
    if os.path.isabs(sqlite_path):
        parent = os.path.dirname(sqlite_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        return f"sqlite:///{sqlite_path}"
    return f"sqlite:///./{sqlite_path}"


SQLALCHEMY_DATABASE_URL = _resolve_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("layout_settings")]
    if "draft_subject" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE layout_settings ADD COLUMN draft_subject VARCHAR"))
