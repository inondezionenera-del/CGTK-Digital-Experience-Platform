"""Misi dan achievement.

Misi dikelompokkan per acara, bukan jadi satu daftar panjang. Booth Teknik
Informatika mungkin cuma buka Hari 2; kalau misinya tercampur, peserta datang
di hari yang salah dan boothnya sudah tutup.

XP misi diberikan lewat tambah_xp() di database, tidak dengan menulis langsung
ke ledger. Alasannya sama seperti di gamification.py.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.keamanan import Pemanggil, verifikasi
from app.models.missions import (
    Achievement,
    Mission,
    ParticipantAchievement,
    ParticipantMission,
)
from app.routers.gamification import beri_xp
from app.schemas.missions import MisiResponse, SelesaikanMisiRequest

router = APIRouter(prefix="/missions", tags=["Missions"])


def milik_sendiri(pemanggil: Pemanggil, participant_id: str) -> None:
    if pemanggil.peran == "PESERTA" and pemanggil.id != participant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"kode": "TIDAK_BERHAK", "pesan": "Itu bukan datamu."},
        )


@router.get("/saya/{participant_id}", response_model=list[MisiResponse])
def misi_saya(
    participant_id: str,
    db: Session = Depends(get_db),
    pemanggil: Pemanggil = Depends(verifikasi),
):
    milik_sendiri(pemanggil, participant_id)

    misi = db.query(Mission).filter(Mission.aktif.is_(True)).order_by(Mission.id).all()
    kemajuan = {
        p.mission_id: p
        for p in db.query(ParticipantMission)
        .filter(ParticipantMission.participant_id == participant_id)
        .all()
    }

    hasil = []
    for m in misi:
        p = kemajuan.get(m.id)
        hasil.append(
            MisiResponse(
                id=m.id,
                nama=m.nama,
                deskripsi=m.deskripsi,
                tipe=m.tipe,
                xp=m.xp or 0,
                event_id=m.event_id,
                status=(p.status if p else "BELUM"),
                progress=(p.progress if p else 0),
            )
        )
    return hasil


@router.post("/selesai")
def selesaikan_misi(
    payload: SelesaikanMisiRequest,
    db: Session = Depends(get_db),
    pemanggil: Pemanggil = Depends(verifikasi),
):
    milik_sendiri(pemanggil, payload.participant_id)

    misi = db.query(Mission).filter(Mission.id == payload.mission_id).first()
    if not misi or not misi.aktif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"kode": "TIDAK_DITEMUKAN", "pesan": "Misi tidak ditemukan."},
        )

    baris = (
        db.query(ParticipantMission)
        .filter(
            ParticipantMission.participant_id == payload.participant_id,
            ParticipantMission.mission_id == payload.mission_id,
        )
        .first()
    )

    # Sudah selesai sebelumnya: jawab tenang, jangan beri XP lagi dan jangan
    # anggap ini kesalahan. HP yang mengirim ulang permintaan yang sama tidak
    # boleh menghasilkan XP dobel.
    if baris and baris.status == "SELESAI":
        return {"status": "SUDAH_SELESAI", "xp_didapat": 0}

    if baris is None:
        baris = ParticipantMission(
            participant_id=payload.participant_id,
            mission_id=payload.mission_id,
        )
        db.add(baris)

    baris.status = "SELESAI"
    baris.progress = 100
    baris.selesai_at = text("now()")  # type: ignore[assignment]
    db.commit()

    xp = 0
    try:
        beri_xp(
            db,
            participant_id=payload.participant_id,
            activity_kode="SELESAI_MISI",
            sumber_tipe="MISI",
            sumber_id=payload.mission_id,
            xp_override=misi.xp,
            diberikan_oleh=pemanggil.id,
        )
        xp = int(misi.xp or 0)
    except HTTPException:
        xp = 0

    return {"status": "SELESAI", "xp_didapat": xp}


# =============================================================================
# Achievements. Prefix terpisah karena Worker meneruskannya sebagai awalan
# tersendiri; /missions/achievements tidak akan pernah sampai ke sini.
# =============================================================================

router_achievement = APIRouter(prefix="/achievements", tags=["Achievements"])


@router_achievement.get("/saya/{participant_id}")
def achievement_saya(
    participant_id: str,
    db: Session = Depends(get_db),
    pemanggil: Pemanggil = Depends(verifikasi),
):
    """Semua badge, yang sudah didapat maupun belum.

    Yang belum didapat tetap dikirim, lengkap dengan syaratnya. Peserta perlu
    tahu apa yang menunggu; menyembunyikannya menghilangkan satu-satunya alasan
    mereka mengejarnya.
    """
    milik_sendiri(pemanggil, participant_id)

    semua = (
        db.query(Achievement)
        .filter(Achievement.aktif.is_(True))
        .order_by(Achievement.id)
        .all()
    )
    didapat = {
        p.achievement_id: p
        for p in db.query(ParticipantAchievement)
        .filter(ParticipantAchievement.participant_id == participant_id)
        .all()
    }

    return [
        {
            "id": a.id,
            "kode": a.kode,
            "nama": a.nama,
            "deskripsi": a.deskripsi,
            "ikon_url": a.ikon_url,
            "syarat": a.syarat,
            "didapat": a.id in didapat,
            "earned_at": (
                didapat[a.id].earned_at.isoformat() if a.id in didapat else None
            ),
        }
        for a in semua
    ]
