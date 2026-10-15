from pydantic import BaseModel

class LeaderboardItem(BaseModel):
    rank: int
    participant_id: str
    total_xp: int

    class Config:
        from_attributes = True