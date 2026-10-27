"""Pengaturan layanan.

Dibaca dari lingkungan, dan di Vercel itu artinya Environment Variables di
dasbor, bukan berkas. Berkas .env hanya dipakai waktu menjalankan di laptop.

Versi pertama berkas ini menunjuk ke `.env.example`, yaitu berkas contoh yang
nilainya memang sengaja kosong. Akibatnya layanan ini akan berjalan dengan
pengaturan kosong tanpa mengeluh sedikit pun.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # User cgtk_kuis, port 6543 (Connection Pooler). Layanan ini memegang
    # sambungan lama, tidak seperti Worker yang membuka dan menutup cepat;
    # memakai 5432 waktu pesertanya ramai membuat sambungan ke-61 ditolak, dan
    # yang mati bukan cuma fitur kuis.
    DATABASE_URL: str

    # Kunci bersama dengan Worker untuk menandatangani identitas pemanggil.
    # Tanpa ini layanan menolak semua permintaan, bukan melayaninya.
    CGTK_SECRET: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
