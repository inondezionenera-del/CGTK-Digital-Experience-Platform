"""XP: dibaca di sini, diberikan lewat fungsi Postgres.

Perubahan terpenting dari versi pertama ada di fungsi beri_xp(). Dulu dia
menyusun baris PointTransaction sendiri lalu db.add(), yaitu menulis langsung
ke ledger. Sekarang dia memanggil tambah_xp() di database.

Kenapa itu penting, dan bukan soal gaya:

  - tambah_xp() menerapkan batas XP per booth yang diatur Divisi Acara. Menulis
    langsung melewati batas itu, dan peserta bisa menumpuk XP dari satu meja.
  - tambah_xp() menulis catatan audit. Tanpa itu, kalau ada yang protes "kok
    dia menang, curang itu", tidak ada data untuk menjawabnya.
  - user database cgtk_kuis memang cuma punya hak SELECT di point_transactions,
    jadi INSERT langsung akan ditolak Postgres. Kode lama tidak akan jalan
    bahkan kalau nama kolomnya sudah benar.

Prefix berubah dari /gamification ke /levels. Worker cuma meneruskan tujuh
awalan ke layanan ini: quiz, missions, achievements, leaderboard, levels,
cosmetics, reports. Apa pun di luar itu tidak pernah sampai ke sini.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.keamanan import Pemanggil, verifikasi
from app.schemas.gamification import TambahXPRequest, TotalXPResponse

router = APIRouter(prefix="/levels", tags=["Levels & XP"])


def beri_xp(
    db: Session,
    participant_id: str,
    activity_kode: str,
    sumber_tipe: str,
    sumber_id: int | None = None,
    xp_override: int | None = None,
    diberikan_oleh: str | None = None,
    catatan: str | None = None,
) -> int:
    """Satu-satunya pintu memberi XP dari layanan ini.

    Mengembalikan id baris ledger. Melempar HTTPException kalau database
    menolak, misalnya karena batas XP booth sudah tercapai.
    """
    hasil = db.execute(
        text(
            "select tambah_xp("
            "  :pid, :kode, :sumber_tipe, :sumber_id, :xp, :oleh, :catatan"
            ") as id"
        ),
        {
            "pid": participant_id,
            "kode": activity_kode,
            "sumber_tipe": sumber_tipe,
            "sumber_id": sumber_id,
            "xp": xp_override,
            "oleh": diberikan_oleh,
            "catatan": catatan,
        },
    ).first()
    db.commit()

    if hasil is None or hasil.id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "kode": "XP_DITOLAK",
                "pesan": "XP tidak diberikan. Mungkin batas untuk sumber ini sudah tercapai.",
            },
        )
    return int(hasil.id)


@router.post("/xp/tambah")
def api_tambah_xp(
    payload: TambahXPRequest,
    db: Session = Depends(get_db),
    pemanggil: Pemanggil = Depends(verifikasi),
):
    """Memberi XP. Hanya untuk pemanggil yang memang berhak mengatur XP."""
    pemanggil.butuh("ATUR_XP")

    baris = beri_xp(
        db,
        participant_id=payload.participant_id,
        activity_kode=payload.activity_kode,
        sumber_tipe=payload.sumber_tipe,
        sumber_id=payload.sumber_id,
        xp_override=payload.xp,
        diberikan_oleh=pemanggil.id,
        catatan=payload.catatan,
    )
    return {"id": baris}


@router.get("/xp/total/{participant_id}", response_model=TotalXPResponse)
def total_xp(
    participant_id: str,
    db: Session = Depends(get_db),
    pemanggil: Pemanggil = Depends(verifikasi),
):
    """Total XP seseorang, dihitung dari ledger, bukan dari kolom tersimpan.

    Memakai fungsi total_xp() di database supaya definisinya satu: baris yang
    dibatalkan tidak ikut dijumlahkan, dan aturan itu tidak perlu diulang di
    tiap bahasa.
    """
    # Peserta hanya boleh melihat miliknya sendiri. Tanpa ini, siapa pun yang
    # login bisa membaca XP orang lain hanya dengan menukar id di alamat.
    if pemanggil.peran == "PESERTA" and pemanggil.id != participant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"kode": "TIDAK_BERHAK", "pesan": "Itu bukan datamu."},
        )

    total = db.execute(
        text("select coalesce(total_xp(:pid), 0) as t"), {"pid": participant_id}
    ).scalar_one()

    level = db.execute(
        text("select level_peserta(:t::int) as lv"), {"t": total}
    ).scalar_one()

    return TotalXPResponse(participant_id=participant_id, total_xp=int(total), level=level)
