from sqlalchemy import Column, String, Integer, DateTime, func
from app.database import Base

class PointTransaction(Base):
    __tablename__ = "point_transactions"

    id = Column(Integer, primary_key=True, index=True)
    participant_id = Column(String, nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # Jumlah XP (misal: +100)
    source = Column(String, nullable=False)    # Sumber XP: "QUIZ", "MISSION", "EVENT"
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())