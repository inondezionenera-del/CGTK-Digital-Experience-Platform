from pydantic import BaseModel


class BarisPeringkat(BaseModel):
    peringkat: int
    participant_id: str
    nama: str
    total_xp: int


class PeringkatResponse(BaseModel):
    beku: bool = False
    dibekukan_at: str | None = None
    baris: list[BarisPeringkat] = []
