from sqlalchemy import create_engine, Column, Integer, String, Text, UniqueConstraint
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

# SQLite setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./pdftodraft.db"

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
