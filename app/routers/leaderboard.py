"""Papan peringkat.

Perhitungannya dilakukan fungsi hitung_leaderboard() di database, bukan di sini.
Satu alasan: aturan pemutus seri (XP tertinggi, lalu yang lebih dulu
mencapainya, lalu lebih banyak booth, lalu lebih dulu mendaftar) harus punya
satu definisi. Kalau ditulis ulang di Python, dua tempat itu akan berselisih
pada suatu hari, dan yang dipersoalkan adalah siapa yang menang.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.keamanan import Pemanggil, verifikasi
from app.schemas.leaderboard import BarisPeringkat, PeringkatResponse

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])


@router.get("", response_model=PeringkatResponse)
def peringkat(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: Pemanggil = Depends(verifikasi),
):
    beku = db.execute(
        text(
            "select dibekukan_at from leaderboard_freeze "
            "order by dibekukan_at desc limit 1"
        )
    ).scalar()

    baris = db.execute(
        text("select * from hitung_leaderboard(:limit)"), {"limit": limit}
    ).mappings().all()

    return PeringkatResponse(
        beku=beku is not None,
        dibekukan_at=beku.isoformat() if beku else None,
        baris=[
            BarisPeringkat(
                peringkat=i + 1,
                participant_id=str(b.get("participant_id")),
                nama=str(b.get("nama") or "Peserta"),
                total_xp=int(b.get("total_xp") or 0),
            )
            for i, b in enumerate(baris)
        ],
    )
