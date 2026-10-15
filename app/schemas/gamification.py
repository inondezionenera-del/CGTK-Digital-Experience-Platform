from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TambahXPRequest(BaseModel):
    participant_id: str
    amount: int
    source: str
    description: Optional[str] = None

class PointTransactionResponse(BaseModel):
    id: int
    participant_id: str
    amount: int
    source: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TotalXPResponse(BaseModel):
    participant_id: str
    total_xp: int