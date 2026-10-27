"""Tabel misi dan achievement.

Sama seperti quiz.py: nama kolom mengikuti tabel yang sudah ada.

participant_missions dan participant_achievements memakai kunci primer gabungan
(participant_id + mission_id / achievement_id), bukan kolom id sendiri. Itulah
yang membuat seseorang tidak bisa punya dua baris untuk misi yang sama, dan
model ini harus menyatakannya supaya SQLAlchemy tidak mengarang kolom id yang
tidak ada di sana.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class Mission(Base):
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    nama = Column(Text, nullable=False)
    deskripsi = Column(Text)
    tipe = Column(Text)
    target = Column(JSONB)
    xp = Column(Integer, default=0)
    event_id = Column(Integer)
    aktif = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ParticipantMission(Base):
    __tablename__ = "participant_missions"

    participant_id = Column(UUID(as_uuid=False), primary_key=True)
    mission_id = Column(
        Integer, ForeignKey("missions.id", ondelete="CASCADE"), primary_key=True
    )
    status = Column(Text, default="BELUM")
    progress = Column(Integer, default=0)
    selesai_at = Column(DateTime(timezone=True))


class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    kode = Column(Text, nullable=False, unique=True)
    nama = Column(Text, nullable=False)
    deskripsi = Column(Text)
    ikon_url = Column(Text)
    syarat = Column(JSONB)
    aktif = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ParticipantAchievement(Base):
    __tablename__ = "participant_achievements"

    participant_id = Column(UUID(as_uuid=False), primary_key=True)
    achievement_id = Column(
        Integer, ForeignKey("achievements.id", ondelete="CASCADE"), primary_key=True
    )
    earned_at = Column(DateTime(timezone=True), server_default=func.now())
