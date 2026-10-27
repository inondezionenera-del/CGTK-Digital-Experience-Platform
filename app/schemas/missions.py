from pydantic import BaseModel


class MisiResponse(BaseModel):
    id: int
    nama: str
    deskripsi: str | None = None
    tipe: str | None = None
    xp: int = 0
    # Dipakai frontend untuk mengelompokkan misi per acara, supaya peserta tidak
    # datang di hari yang salah.
    event_id: int | None = None
    status: str = "BELUM"
    progress: int = 0

    class Config:
        from_attributes = True


class SelesaikanMisiRequest(BaseModel):
    participant_id: str
    mission_id: int
