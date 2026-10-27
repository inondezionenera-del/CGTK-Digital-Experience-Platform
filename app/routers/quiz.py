"""Kuis minat dan bakat.

Tiga aturan yang dijaga di sini:

1. `bobot` tidak pernah keluar. Lihat catatan di schemas/quiz.py.
2. Jumlah percobaan dibaca dari tabel settings, bukan angka di program, supaya
   Divisi Acara bisa menggantinya tanpa menyentuh kode ini.
3. XP diberikan lewat fungsi tambah_xp() di database, tidak pernah dengan
   menulis langsung ke point_transactions.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.keamanan import Pemanggil, verifikasi
from app.models.quiz import QuizAttempt, QuizOption, QuizQuestion
from app.routers.gamification import beri_xp
from app.schemas.quiz import (
    QuizAttemptResponse,
    QuizMulaiRequest,
    QuizQuestionResponse,
    QuizSelesaiRequest,
    QuizSelesaiResponse,
)

router = APIRouter(prefix="/quiz", tags=["Quiz"])


def ambil_setting(db: Session, kunci: str, bawaan: str) -> str:
    hasil = db.execute(
        text("select nilai from settings where kunci = :k"), {"k": kunci}
    ).scalar()
    return hasil if hasil is not None else bawaan


def milik_sendiri(pemanggil: Pemanggil, participant_id: str) -> None:
    """Peserta hanya boleh menyentuh datanya sendiri."""
    if pemanggil.peran == "PESERTA" and pemanggil.id != participant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"kode": "TIDAK_BERHAK", "pesan": "Itu bukan datamu."},
        )


@router.get("/soal", response_model=list[QuizQuestionResponse])
def daftar_soal(
    db: Session = Depends(get_db),
    _: Pemanggil = Depends(verifikasi),
):
    soal = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.aktif.is_(True))
        .order_by(QuizQuestion.urutan)
        .all()
    )

    # Opsi diambil terpisah dan dipetakan tangan, bukan lewat relasi. Relasi
    # akan membawa serta kolom bobot, dan satu serialisasi yang tidak sengaja
    # sudah cukup untuk membocorkan kunci jawabannya.
    semua_opsi = (
        db.query(QuizOption)
        .filter(QuizOption.question_id.in_([s.id for s in soal]))
        .order_by(QuizOption.urutan)
        .all()
        if soal
        else []
    )

    per_soal: dict[int, list[dict]] = {}
    for o in semua_opsi:
        per_soal.setdefault(o.question_id, []).append({"id": o.id, "teks": o.teks})

    return [
        {
            "id": s.id,
            "teks": s.teks,
            "urutan": s.urutan,
            "options": per_soal.get(s.id, []),
        }
        for s in soal
    ]


@router.get("/soal/{question_id}/opsi")
def opsi_soal(
    question_id: int,
    db: Session = Depends(get_db),
    _: Pemanggil = Depends(verifikasi),
):
    """Pilihan jawaban satu soal. Dipisah supaya `bobot` tidak pernah ikut
    terbawa lewat relasi yang tidak sengaja ter-serialize."""
    opsi = (
        db.query(QuizOption)
        .filter(QuizOption.question_id == question_id)
        .order_by(QuizOption.urutan)
        .all()
    )
    return [{"id": o.id, "teks": o.teks} for o in opsi]


@router.post("/mulai", response_model=QuizAttemptResponse)
def mulai_kuis(
    payload: QuizMulaiRequest,
    db: Session = Depends(get_db),
    pemanggil: Pemanggil = Depends(verifikasi),
):
    milik_sendiri(pemanggil, payload.participant_id)

    maks = int(ambil_setting(db, "max_percobaan_kuis", "3"))
    sudah = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.participant_id == payload.participant_id)
        .count()
    )
    if sudah >= maks:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "kode": "PERCOBAAN_HABIS",
                "pesan": f"Kamu sudah memakai {maks} percobaan.",
            },
        )

    attempt = QuizAttempt(
        participant_id=payload.participant_id,
        nomor_percobaan=sudah + 1,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


@router.post("/selesai", response_model=QuizSelesaiResponse)
def selesai_kuis(
    payload: QuizSelesaiRequest,
    db: Session = Depends(get_db),
    pemanggil: Pemanggil = Depends(verifikasi),
):
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == payload.attempt_id).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"kode": "TIDAK_DITEMUKAN", "pesan": "Percobaan tidak ditemukan."},
        )

    milik_sendiri(pemanggil, str(attempt.participant_id))

    if attempt.selesai_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"kode": "SUDAH_SELESAI", "pesan": "Percobaan ini sudah selesai."},
        )

    # --- hitung skor per rumpun ---------------------------------------------
    ids = [a.option_id for a in payload.answers]
    opsi = db.query(QuizOption).filter(QuizOption.id.in_(ids)).all() if ids else []

    skor: dict[str, float] = {}
    for o in opsi:
        for rumpun, nilai in (o.bobot or {}).items():
            skor[rumpun] = skor.get(rumpun, 0) + float(nilai)

    rumpun = max(skor, key=lambda k: skor[k]) if skor else "Umum"

    # --- jurusan dan kampus yang cocok --------------------------------------
    # Kampus disaring ke yang benar-benar membuka booth di CGTK. Merekomendasikan
    # kampus yang tidak hadir cuma membuat peserta mencari meja yang tidak ada.
    jurusan = db.execute(
        text(
            "select id, nama from majors "
            "where aktif = true and rumpun = :r order by nama limit 5"
        ),
        {"r": rumpun},
    ).mappings().all()

    kampus = db.execute(
        text(
            "select distinct u.id, u.nama, u.singkatan "
            "from universities u "
            "join university_majors um on um.university_id = u.id "
            "join majors m on m.id = um.major_id "
            "join booths b on b.university_id = u.id and b.status <> 'DRAFT' "
            "where u.aktif = true and m.rumpun = :r "
            "order by u.nama limit 5"
        ),
        {"r": rumpun},
    ).mappings().all()

    attempt.jawaban = [a.model_dump() for a in payload.answers]
    attempt.skor = skor
    attempt.hasil_rumpun = rumpun
    attempt.hasil_jurusan = [dict(j) for j in jurusan]
    attempt.hasil_kampus = [dict(k) for k in kampus]
    attempt.selesai_at = text("now()")  # type: ignore[assignment]
    db.commit()

    # --- XP, lewat fungsi database ------------------------------------------
    xp_didapat = None
    try:
        beri_xp(
            db,
            participant_id=str(attempt.participant_id),
            activity_kode="SELESAI_KUIS",
            sumber_tipe="KUIS",
            sumber_id=int(attempt.id),
            diberikan_oleh=pemanggil.id,
        )
        xp_didapat = int(
            db.execute(
                text("select xp from activities where kode = 'SELESAI_KUIS'")
            ).scalar()
            or 0
        )
    except HTTPException:
        # XP ditolak, misalnya karena percobaan kedua tidak memberi XP lagi.
        # Hasil kuisnya tetap sah dan tetap dikembalikan; XP bukan syarat.
        xp_didapat = 0

    return QuizSelesaiResponse(
        attempt_id=int(attempt.id),
        hasil_rumpun=rumpun,
        skor=skor,
        hasil_jurusan=[dict(j) for j in jurusan],
        hasil_kampus=[dict(k) for k in kampus],
        xp_didapat=xp_didapat,
    )
