from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List

from app.database import get_db
from app.models.gamification import PointTransaction
from app.schemas.leaderboard import LeaderboardItem

router = APIRouter(
    prefix="/leaderboard",
    tags=["Leaderboard"]
)

# Endpoint: Ambil Top Leaderboard
@router.get("", response_model=List[LeaderboardItem])
def get_leaderboard(limit: int = 10, db: Session = Depends(get_db)):
    # Grouping berdasarkan participant_id & hitung SUM(amount), urutkan dari yang terbesar
    results = db.query(
        PointTransaction.participant_id,
        func.sum(PointTransaction.amount).label("total_xp")
    ).group_by(
        PointTransaction.participant_id
    ).order_by(
        desc("total_xp")
    ).limit(limit).all()

    # Permeringkatan leaderboard
    leaderboard_list = []
    for rank, item in enumerate(results, start=1):
        leaderboard_list.append(LeaderboardItem(
            rank=rank,
            participant_id=item.participant_id,
            total_xp=item.total_xp
        ))

    return leaderboard_list