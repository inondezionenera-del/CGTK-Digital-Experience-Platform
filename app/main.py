"""Layanan Python CGTK 2027: kuis, misi, achievement, leaderboard, level.

Dipanggil hanya lewat Worker, tidak pernah langsung dari browser peserta.
Worker memeriksa token Supabase dan hak aksesnya lalu meneruskan identitas
pemanggil sebagai dua header bertanda tangan. Lihat app/keamanan.py.

Tabel TIDAK pernah dibuat dari sini. Struktur database milik migration di sisi
TypeScript; kalau SQLAlchemy ikut membuat tabel, dua sumber kebenaran akan
berselisih dan yang kalah adalah datanya. Karena itu create_all tidak dipanggil
di mana pun, bukan sekadar dikomentari.
"""

from fastapi import FastAPI

from app.routers import gamification, leaderboard, missions, quiz

app = FastAPI(
    title="CGTK 2027 - Quiz, Gamification & Content Service",
    description="Layanan Python, dipanggil lewat Worker.",
    version="1.0.0",
)

# Awalan yang diteruskan Worker ke sini: quiz, missions, achievements,
# leaderboard, levels, cosmetics, reports. Router yang awalannya di luar daftar
# itu tidak akan pernah menerima permintaan.
app.include_router(quiz.router)
app.include_router(missions.router)
app.include_router(missions.router_achievement)
app.include_router(leaderboard.router)
app.include_router(gamification.router)


@app.get("/health")
def health():
    """Sengaja tanpa tanda tangan: dipakai untuk memastikan layanannya hidup."""
    return {"status": "ok"}
