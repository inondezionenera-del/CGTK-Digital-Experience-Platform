from pydantic import BaseModel
from typing import List, Optional, Any

# Skema untuk pilihan jawaban (Sengaja TANPA BOBOT agar tidak bocor ke frontend)
class QuizOptionResponse(BaseModel):
    id: int
    teks_jawaban: str

    class Config:
        from_attributes = True

# Skema untuk Soal Kuis
class QuizQuestionResponse(BaseModel):
    id: int
    pertanyaan: str
    urutan: int
    options: List[QuizOptionResponse]

    class Config:
        from_attributes = True


class QuizMulaiRequest(BaseModel):
    participant_id: str

class QuizAttemptResponse(BaseModel):
    id: int
    participant_id: str
    nomor_percobaan: int

    class Config:
        from_attributes = True

# --- Skema Tambahan untuk Endpoint /quiz/selesai ---

class JawabanItem(BaseModel):
    question_id: int
    option_id: int

class QuizSelesaiRequest(BaseModel):
    attempt_id: int
    answers: List[JawabanItem]

class QuizSelesaiResponse(BaseModel):
    attempt_id: int
    hasil_rumpun: str
    rekomendasi_jurusan: List[str]
    rekomendasi_kampus: List[str]
    xp_diperoleh: int