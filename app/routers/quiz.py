from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.config import settings
from app.models.quiz import QuizQuestion, QuizAttempt, QuizOption
from app.schemas.quiz import (
    QuizQuestionResponse, 
    QuizMulaiRequest, 
    QuizAttemptResponse,
    QuizSelesaiRequest,
    QuizSelesaiResponse
)
# import fungsi tambah_xp dari router gamification
from app.routers.gamification import tambah_xp

router = APIRouter(
    prefix="/quiz",
    tags=["Quiz"]
)

# ... (endpoint /soal dan /mulai tetap sama) ...

@router.post("/selesai", response_model=QuizSelesaiResponse)
def selesai_quiz(payload: QuizSelesaiRequest, db: Session = Depends(get_db)):
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == payload.attempt_id).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data percobaan kuis tidak ditemukan."
        )

    # 1. gitung total bobot nilai per rumpun
    skor_rumpun = {}
    for ans in payload.answers:
        option = db.query(QuizOption).filter(QuizOption.id == ans.option_id).first()
        if option and option.bobot:
            for rumpun, nilai in option.bobot.items():
                skor_rumpun[rumpun] = skor_rumpun.get(rumpun, 0) + nilai

    # 2. tentukan rumpun dengan skor tertinggi
    rumpun_tertinggi = max(skor_rumpun, key=skor_rumpun.get) if skor_rumpun else "Umum"

    # 3. contoh rekomendasi
    rekomendasi_jurusan = [f"Teknik / Informatika ({rumpun_tertinggi})", "Manajemen Sistem"]
    rekomendasi_kampus = ["Kampus CGTK Utama", "Politeknik Digital"]

    # 4. s
    # impan hasil kuis ke database
    attempt.hasil_rumpun = rumpun_tertinggi
    attempt.rekomendasi_jurusan = rekomendasi_jurusan
    attempt.rekomendasi_kampus = rekomendasi_kampus
    db.commit()

    # 5. BERIKAN HADIAH XP OTOMATIS LEWAT GAMIFIKASI
    xp_hadiah = 100
    tambah_xp(
        db=db,
        participant_id=attempt.participant_id,
        amount=xp_hadiah,
        source="QUIZ",
        description=f"Hadiah Penyelesaian Kuis (Percobaan Ke-{attempt.nomor_percobaan})"
    )

    return QuizSelesaiResponse(
        attempt_id=attempt.id,
        hasil_rumpun=rumpun_tertinggi,
        rekomendasi_jurusan=rekomendasi_jurusan,
        rekomendasi_kampus=rekomendasi_kampus,
        xp_diperoleh=xp_hadiah
    )