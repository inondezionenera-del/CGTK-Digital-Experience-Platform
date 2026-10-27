from typing import Any

from pydantic import BaseModel, Field


class QuizOptionResponse(BaseModel):
    """Pilihan jawaban, SENGAJA tanpa `bobot`.

    bobot adalah kunci jawabannya: berapa poin tiap rumpun untuk pilihan ini.
    Siapa pun yang bisa membacanya bisa menyusun jawaban yang menghasilkan
    rumpun apa pun yang dia mau, dan seluruh rekomendasi jurusan jadi tidak
    berarti. Jangan pernah menambahkannya ke sini, walaupun kelihatan praktis.
    """

    id: int
    teks: str

    class Config:
        from_attributes = True


class QuizQuestionResponse(BaseModel):
    id: int
    teks: str
    urutan: int | None = None
    options: list[QuizOptionResponse] = []

    class Config:
        from_attributes = True


class QuizMulaiRequest(BaseModel):
    participant_id: str


class QuizAttemptResponse(BaseModel):
    id: int
    participant_id: str
    nomor_percobaan: int
    hasil_rumpun: str | None = None

    class Config:
        from_attributes = True


class Jawaban(BaseModel):
    question_id: int
    option_id: int


class QuizSelesaiRequest(BaseModel):
    attempt_id: int
    answers: list[Jawaban] = Field(min_length=1)


class QuizSelesaiResponse(BaseModel):
    attempt_id: int
    hasil_rumpun: str
    skor: dict[str, Any]
    hasil_jurusan: list[dict[str, Any]] = []
    hasil_kampus: list[dict[str, Any]] = []
    xp_didapat: int | None = None
