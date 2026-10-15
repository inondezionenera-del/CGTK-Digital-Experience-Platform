from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, JSON, DateTime, func
from sqlalchemy.orm import relationship
from app.database import Base

class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    pertanyaan = Column(String, nullable=False)
    urutan = Column(Integer, default=0)

    options = relationship("QuizOption", back_populates="question")

class QuizOption(Base):
    __tablename__ = "quiz_options"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False)
    teks_jawaban = Column(String, nullable=False)
    bobot = Column(JSON, nullable=False)  # Catatan: Bobot ini TIDAK Boleh dikirim ke frontend!

    question = relationship("QuizQuestion", back_populates="options")

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    participant_id = Column(String, nullable=False)
    nomor_percobaan = Column(Integer, nullable=False)
    hasil_rumpun = Column(String, nullable=True)
    rekomendasi_jurusan = Column(JSON, nullable=True)
    rekomendasi_kampus = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())