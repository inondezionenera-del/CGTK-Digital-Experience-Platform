from typing import Any

from pydantic import BaseModel, Field


class TambahXPRequest(BaseModel):
    participant_id: str
    # Kode aktivitas, bukan angka XP. Nilai bawaannya ada di tabel activities
    # dan diatur Divisi Acara; mengirim angka dari sini akan melewati pengaturan
    # mereka. xp hanya diisi kalau memang perlu menimpanya.
    activity_kode: str
    sumber_tipe: str
    sumber_id: int | None = None
    xp: int | None = Field(default=None, ge=0)
    catatan: str | None = Field(default=None, max_length=300)


class TotalXPResponse(BaseModel):
    participant_id: str
    total_xp: int
    # { nomor, nama, xp_minimum } dari level_peserta() di database.
    level: dict[str, Any] | None = None
