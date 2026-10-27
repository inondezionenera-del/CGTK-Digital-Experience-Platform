"""Ledger XP, hanya untuk DIBACA.

Model ini sengaja tidak dipakai untuk menulis apa pun, dan user database
`cgtk_kuis` memang cuma punya hak SELECT di tabel ini. Kalau layanan ini
mencoba INSERT, Postgres yang menolaknya, bukan kesepakatan.

Alasannya satu kalimat: XP ditulis dari empat tempat (scanner presensi, scanner
booth, selesai kuis, selesai misi), dan dengan satu penulis ledger punya satu
definisi benar. Dengan dua penulis, perselisihan soal total XP seseorang tidak
bisa diselesaikan setelah acara lewat.

Untuk MEMBERI XP, panggil fungsi Postgres tambah_xp() lewat rpc. Fungsi itu
yang menerapkan batas XP per booth dan menulis catatan audit. Lihat
app/routers/gamification.py.
"""

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class PointTransaction(Base):
    __tablename__ = "point_transactions"

    id = Column(BigInteger, primary_key=True, index=True)
    participant_id = Column(UUID(as_uuid=False), nullable=False, index=True)

    # activity_id WAJIB dan tidak punya nilai bawaan. Versi pertama berkas ini
    # tidak menyebutnya sama sekali, jadi INSERT pertamanya pasti gagal dengan
    # "null value in column activity_id violates not-null constraint".
    activity_id = Column(Integer, nullable=False)

    xp = Column(Integer, nullable=False)
    sumber_tipe = Column(Text, nullable=False)
    sumber_id = Column(BigInteger)
    diberikan_oleh = Column(UUID(as_uuid=False))

    # Pembatalan tidak menghapus baris, cuma menandainya. Jejaknya tetap ada,
    # dan total XP menjumlahkan yang dibatalkan = false saja.
    dibatalkan = Column(Boolean, nullable=False, default=False)

    catatan = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
