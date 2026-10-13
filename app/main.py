from fastapi import FastAPI
from app.database import engine, Base
from app.routers import quiz, missions, gamification, leaderboard  # Import router missions

# Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CGTK 2027 - Quiz, Gamification & Content Service",
    description="Backend Service Python dikerjakan oleh Danar",
    version="1.0.0"
)

# Hubungkan semua router
app.include_router(quiz.router)
app.include_router(missions.router)
app.include_router(gamification.router)
app.include_router(leaderboard.router)
@app.get("/")
def read_root():
    return {"message": "Service Python CGTK 2027 berjalan dengan lancar!"}