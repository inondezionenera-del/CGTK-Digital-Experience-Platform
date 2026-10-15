from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class MissionResponse(BaseModel):
    id: int
    judul: str
    deskripsi: Optional[str] = None
    xp_reward: int
    tipe: str
    is_completed: bool = False

    class Config:
        from_attributes = True

class KlaimMisiRequest(BaseModel):
    participant_id: str
    mission_id: int

class KlaimMisiResponse(BaseModel):
    message: str
    mission_id: int
    xp_diperoleh: int