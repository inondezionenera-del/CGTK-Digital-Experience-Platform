from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.database import get_db
from app.models.missions import Mission, ParticipantMission
from app.schemas.missions import MissionResponse, KlaimMisiRequest, KlaimMisiResponse
# fungsi tambah_xp dari router gamification
from app.routers.gamification import tambah_xp

router = APIRouter(
    prefix="/missions",
    tags=["Missions"]
)

# endpoint

@router.post("/klaim", response_model=KlaimMisiResponse)
def klaim_misi(payload: KlaimMisiRequest, db: Session = Depends(get_db)):
    mission = db.query(Mission).filter(Mission.id == payload.mission_id).first()
    if not mission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Misi tidak ditemukan."
        )

    record = db.query(ParticipantMission).filter(
        ParticipantMission.participant_id == payload.participant_id,
        ParticipantMission.mission_id == payload.mission_id
    ).first()

    if record and record.is_completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Misi ini sudah pernah diklaim."
        )

    # Catat penyelesaian misi
    if not record:
        record = ParticipantMission(
            participant_id=payload.participant_id,
            mission_id=payload.mission_id,
            is_completed=True,
            completed_at=datetime.utcnow()
        )
        db.add(record)
    else:
        record.is_completed = True
        record.completed_at = datetime.utcnow()

    db.commit()

    # BERIKAN HADIAH XP OTOMATIS LEWAT GAMIFIKASI
    tambah_xp(
        db=db,
        participant_id=payload.participant_id,
        amount=mission.xp_reward,
        source="MISSION",
        description=f"Klaim Misi: {mission.judul}"
    )

    return KlaimMisiResponse(
        message="Misi berhasil diklaim!",
        mission_id=mission.id,
        xp_diperoleh=mission.xp_reward
    )