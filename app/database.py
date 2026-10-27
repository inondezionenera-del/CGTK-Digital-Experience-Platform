"""Sambungan ke Postgres.

Memakai Connection Pooler Supabase (port 6543), bukan sambungan langsung.
Layanan ini memegang sambungan lama, tidak seperti Worker yang membuka dan
menutup cepat. Di paket gratis, sambungan langsung ke-61 ditolak, dan yang mati
bukan cuma fitur kuis: semua yang memakai database ikut terhenti.

pool_pre_ping menguji sambungan sebelum dipakai. Pooler memutus sambungan yang
lama menganggur, dan tanpa ini permintaan pertama sesudah jeda sepi akan gagal
dengan "server closed the connection unexpectedly", yang di hari acara berarti
peserta pertama setelah jeda melihat error tanpa sebab.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    pool_recycle=300,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
