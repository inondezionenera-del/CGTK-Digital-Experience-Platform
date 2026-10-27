"""Tabel kuis.

Nama kolom di sini HARUS sama persis dengan tabel yang sudah ada. Migration
dijalankan dari sisi TypeScript dan tabelnya sudah terisi, jadi model di sini
mengikuti tabel, bukan sebaliknya. Versi pertama berkas ini memakai nama
karangan (`pertanyaan`, `teks_jawaban`), dan akibatnya setiap query gagal
sebelum menyentuh satu baris pun.

Base.metadata.create_all SENGAJA tidak pernah dipanggil di mana pun. Struktur
tabel milik migration; kalau SQLAlchemy ikut membuat tabel, dua sumber
kebenaran akan berselisih dan yang kalah adalah data.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    BigInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    teks = Column(Text, nullable=False)
    urutan = Column(Integer, default=0)
    aktif = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class QuizOption(Base):
    __tablename__ = "quiz_options"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(
        Integer, ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False
    )
    teks = Column(Text, nullable=False)

    # Kunci jawaban: bobot tiap rumpun untuk pilihan ini.
    #
    # TIDAK PERNAH dikirim ke frontend. Siapa pun yang bisa membacanya bisa
    # menghitung jawaban yang menghasilkan rumpun apa pun yang dia mau, dan
    # rekomendasi jurusannya jadi tidak berarti. Lihat skema Pydantic: bobot
    # tidak ikut di sana, dan itu disengaja.
    bobot = Column(JSONB)

    urutan = Column(Integer, default=0)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(BigInteger, primary_key=True, index=True)
    participant_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    nomor_percobaan = Column(Integer, nullable=False)
    jawaban = Column(JSONB)
    skor = Column(JSONB)
    hasil_rumpun = Column(Text)
    hasil_jurusan = Column(JSONB)
    hasil_kampus = Column(JSONB)
    selesai_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
