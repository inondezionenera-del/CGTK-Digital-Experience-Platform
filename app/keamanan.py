"""Memastikan permintaan benar-benar datang dari Worker.

Layanan ini tidak pernah dipanggil langsung oleh browser peserta. Semuanya
lewat Worker, yang sudah memeriksa token Supabase dan hak aksesnya, lalu
meneruskan ke sini dengan dua header:

    X-CGTK-Pengguna      JSON berisi id, peran, dan izin pemanggilnya
    X-CGTK-Tanda-Tangan  HMAC-SHA256 dari isi header pertama

Tanda tangan itu yang membuat layanan ini tidak perlu ikut memverifikasi JWT
dan tidak perlu memegang service_role key sama sekali.

Tanpa pemeriksaan ini, siapa pun yang tahu alamat Vercel-nya bisa memanggil
endpoint apa pun di sini sambil mengaku sebagai siapa saja, termasuk Super
Admin. Versi pertama layanan ini tidak memeriksanya sama sekali.
"""

import hashlib
import hmac
import json
from dataclasses import dataclass, field

from fastapi import Header, HTTPException, status

from app.config import settings


@dataclass
class Pemanggil:
    id: str
    peran: str
    izin: list[str] = field(default_factory=list)

    def butuh(self, kode: str) -> None:
        """Hentikan kalau pemanggil tidak punya izin ini."""
        if kode not in self.izin and self.peran != "SUPER_ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"kode": "TIDAK_BERHAK", "pesan": "Kamu tidak punya akses ini."},
            )


def verifikasi(
    x_cgtk_pengguna: str = Header(default=""),
    x_cgtk_tanda_tangan: str = Header(default=""),
) -> Pemanggil:
    """Dipakai sebagai Depends() di setiap endpoint yang butuh identitas."""
    if not settings.CGTK_SECRET:
        # Lebih baik menolak semuanya daripada melayani tanpa pemeriksaan.
        # Kunci yang lupa dipasang tidak boleh berarti pintunya terbuka.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"kode": "BELUM_DISETEL", "pesan": "CGTK_SECRET belum diisi."},
        )

    if not x_cgtk_pengguna or not x_cgtk_tanda_tangan:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"kode": "TIDAK_LOGIN", "pesan": "Permintaan tanpa identitas."},
        )

    diharapkan = hmac.new(
        settings.CGTK_SECRET.encode("utf-8"),
        x_cgtk_pengguna.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # compare_digest, bukan ==. Perbandingan biasa berhenti di karakter pertama
    # yang berbeda, dan selisih waktunya cukup untuk menebak tanda tangan satu
    # karakter demi satu karakter.
    if not hmac.compare_digest(diharapkan, x_cgtk_tanda_tangan):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"kode": "TANDA_TANGAN_SALAH", "pesan": "Identitas tidak sah."},
        )

    try:
        data = json.loads(x_cgtk_pengguna)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"kode": "DATA_TIDAK_VALID", "pesan": "Identitas tidak terbaca."},
        ) from None

    return Pemanggil(
        id=str(data.get("id", "")),
        peran=str(data.get("peran", "")),
        izin=list(data.get("izin", [])),
    )
