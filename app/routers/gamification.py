from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models.gamification import PointTransaction
from app.schemas.gamification import (
    TambahXPRequest, 
    PointTransactionResponse, 
    TotalXPResponse
)

router = APIRouter(
    prefix="/gamification",
    tags=["Gamification"]
)

# Fungsi Helper internal
def tambah_xp(db: Session, participant_id: str, amount: int, source: str, description: str = None):
    trx = PointTransaction(
        participant_id=participant_id,
        amount=amount,
        source=source,
        description=description
    )
    db.add(trx)
    db.commit()
    db.refresh(trx)
    return trx

# Endpoint 1: Tambah XP
@router.post("/xp/tambah", response_model=PointTransactionResponse)
def api_tambah_xp(payload: TambahXPRequest, db: Session = Depends(get_db)):
    trx = tambah_xp(
        db=db,
        participant_id=payload.participant_id,
        amount=payload.amount,
        source=payload.source,
        description=payload.description
    )
    return trx

# Endpoint 2: Cek Total XP
@router.get("/xp/total/{participant_id}", response_model=TotalXPResponse)
def get_total_xp(participant_id: str, db: Session = Depends(get_db)):
    total = db.query(func.sum(PointTransaction.amount)).filter(
        PointTransaction.participant_id == participant_id
    ).scalar() or 0

    return TotalXPResponse(
        participant_id=participant_id,
        total_xp=total
    )

# Endpoint 3: Riwayat XP
@router.get("/xp/riwayat/{participant_id}", response_model=List[PointTransactionResponse])
def get_riwayat_xp(participant_id: str, db: Session = Depends(get_db)):
    riwayat = db.query(PointTransaction).filter(
        PointTransaction.participant_id == participant_id
    ).order_by(PointTransaction.created_at.desc()).all()
    
    return riwayat