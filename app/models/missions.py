from sqlalchemy import Column, String, Integer, Boolean, DateTime, func
from app.database import Base

class Mission(Base):
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    judul = Column(String, nullable=False)
    deskripsi = Column(String, nullable=True)
    xp_reward = Column(Integer, default=0)
    tipe = Column(String, nullable=False)  # Contoh: "KUIS", "BOOTH", "EVALUASI"

class ParticipantMission(Base):
    __tablename__ = "participant_missions"

    id = Column(Integer, primary_key=True, index=True)
    participant_id = Column(String, nullable=False, index=True)
    mission_id = Column(Integer, nullable=False)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)