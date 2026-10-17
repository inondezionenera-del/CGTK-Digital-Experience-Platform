// ==========================================
// KONFIGURASI API
// ==========================================

const API_BASE_URL = window.CGTK_API_BASE_URL || "";


// ==========================================
// STATE
// ==========================================

let events = [];
let sessions = [];
let selectedDate = null;
let refreshTimer = null;


// ==========================================
// ELEMENT
// ==========================================

const dayTabs = document.getElementById("dayTabs");
const scheduleList = document.getElementById("scheduleList");


// ==========================================
// API
// ==========================================

async function fetchAPI(endpoint) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);

    if (!response.ok) {
        throw new Error(`Gagal mengambil data: ${response.status}`);
    }

    return await response.json();
}


// ==========================================
// AMBIL DATA ARRAY
// ==========================================

function ambilDataArray(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    return [];
}


// ==========================================
// LOAD JADWAL
// ==========================================

async function muatJadwal() {
    try {
        tampilkanLoading();

        const [eventsResponse, sessionsResponse] =
            await Promise.all([
                fetchAPI("/events"),
                fetchAPI("/events/sessions")
            ]);

        events = ambilDataArray(eventsResponse);
        sessions = ambilDataArray(sessionsResponse);

        prosesJadwal();

    } catch (error) {
        console.error(error);
        tampilkanError(error.message);
    }
}


// ==========================================
// PROSES JADWAL
// ==========================================

function prosesJadwal() {

    // Backend sebenarnya sudah menghilangkan DRAFT.
    // Filter ini menjadi pengaman tambahan di frontend.
    const sesiTampil = sessions.filter(
        session => session.status !== "DRAFT"
    );

    if (sesiTampil.length === 0) {

        dayTabs.innerHTML = "";

        scheduleList.innerHTML = `
            <div class="schedule-empty">
                Tidak ada jadwal acara.
            </div>
        `;

        return;
    }

    const tanggal = ambilTanggalUnik(sesiTampil);

    if (!selectedDate || !tanggal.includes(selectedDate)) {
        selectedDate = tanggal[0];
    }

    buatDayTabs(tanggal);
    tampilkanJadwal(selectedDate);
}


// ==========================================
// AMBIL TANGGAL DARI EVENT
// ==========================================

function ambilTanggalSession(session) {

    return session.events?.tanggal || null;
}


// ==========================================
// TANGGAL UNIK
// ==========================================

function ambilTanggalUnik(sesi) {

    const tanggal = sesi
        .map(session => ambilTanggalSession(session))
        .filter(Boolean);

    return [...new Set(tanggal)].sort();
}


// ==========================================
// TAB HARI
// ==========================================

function buatDayTabs(tanggal) {

    // Kalau hanya satu hari,
    // tab tidak perlu ditampilkan.
    if (tanggal.length <= 1) {
        dayTabs.innerHTML = "";
        return;
    }

    dayTabs.innerHTML = tanggal
        .map((tanggalAcara, index) => {

            const aktif =
                tanggalAcara === selectedDate
                    ? "active"
                    : "";

            return `
                <button
                    type="button"
                    class="day-tab ${aktif}"
                    data-date="${tanggalAcara}"
                >
                    Hari ${index + 1}
                    <small>
                        ${formatTanggal(tanggalAcara)}
                    </small>
                </button>
            `;
        })
        .join("");

    document.querySelectorAll(".day-tab")
        .forEach(button => {

            button.addEventListener("click", () => {

                selectedDate = button.dataset.date;

                buatDayTabs(tanggal);
                tampilkanJadwal(selectedDate);

            });

        });
}


// ==========================================
// FORMAT TANGGAL
// ==========================================

function formatTanggal(tanggal) {

    const date = new Date(`${tanggal}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return tanggal;
    }

    return date.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short"
    });
}


// ==========================================
// TAMPILKAN JADWAL
// ==========================================

function tampilkanJadwal(tanggal) {

    const sesiHariIni = sessions
        .filter(session => session.status !== "DRAFT")
        .filter(session => {
            return ambilTanggalSession(session) === tanggal;
        })
        .sort(urutkanSession);

    if (sesiHariIni.length === 0) {

        scheduleList.innerHTML = `
            <div class="schedule-empty">
                Tidak ada acara pada hari ini.
            </div>
        `;

        return;
    }

    scheduleList.innerHTML = sesiHariIni
        .map(session => buatSessionHTML(session))
        .join("");
}


// ==========================================
// SESSION HTML
// ==========================================

function buatSessionHTML(session) {

    const namaEvent =
        session.events?.nama || "Acara";

    const tipeEvent =
        session.events?.tipe || "";

    const namaSession =
        session.nama || "Sesi acara";

    const lokasi =
        session.lokasi || "-";

    const waktu =
        formatWaktu(
            session.jam_mulai,
            session.jam_selesai
        );

    const statusHTML =
        buatStatusHTML(session.status);

    const hadirHTML =
        session.saya_sudah_hadir === true
            ? `
                <div class="attendance-status">
                    ✓ Saya sudah hadir
                </div>
            `
            : "";

    return `
        <article
            class="schedule-session status-${String(
                session.status
            ).toLowerCase()}"
        >

            <div class="session-header">

                <span class="event-type">
                    ${escapeHTML(tipeEvent)}
                </span>

                ${statusHTML}

            </div>

            <h2>
                ${escapeHTML(namaEvent)}
            </h2>

            <h3>
                ${escapeHTML(namaSession)}
            </h3>

            <div class="session-detail">

                <span>
                    🕐 ${escapeHTML(waktu)}
                </span>

                <span>
                    📍 ${escapeHTML(lokasi)}
                </span>

            </div>

            ${hadirHTML}

        </article>
    `;
}


// ==========================================
// STATUS
// ==========================================

function buatStatusHTML(status) {

    if (status === "ACTIVE") {

        return `
            <span class="status-badge status-live">
                🟢 LIVE
            </span>
        `;
    }

    if (status === "CLOSED") {

        return `
            <span class="status-badge status-closed">
                Selesai
            </span>
        `;
    }

    return "";
}


// ==========================================
// FORMAT WAKTU
// ==========================================

function formatWaktu(mulai, selesai) {

    if (!mulai) {
        return "-";
    }

    const waktuMulai = formatJam(mulai);

    if (!selesai) {
        return waktuMulai;
    }

    const waktuSelesai = formatJam(selesai);

    return `${waktuMulai} — ${waktuSelesai}`;
}


// ==========================================
// FORMAT JAM
// ==========================================

function formatJam(value) {

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}


// ==========================================
// URUTKAN SESSION
// ==========================================

function urutkanSession(a, b) {

    const waktuA = a.jam_mulai || "";
    const waktuB = b.jam_mulai || "";

    return new Date(waktuA) - new Date(waktuB);
}


// ==========================================
// LOADING
// ==========================================

function tampilkanLoading() {

    scheduleList.innerHTML = `
        <div class="schedule-loading">
            Memuat jadwal...
        </div>
    `;
}


// ==========================================
// ERROR
// ==========================================

function tampilkanError(pesan) {

    scheduleList.innerHTML = `
        <div class="schedule-error">
            ${escapeHTML(pesan)}
        </div>
    `;
}


// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ==========================================
// AUTO REFRESH 60 DETIK
// ==========================================

function mulaiAutoRefresh() {

    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(() => {

        if (!document.hidden) {
            muatJadwal();
        }

    }, 60000);
}


// ==========================================
// SAAT USER KEMBALI KE TAB
// ==========================================

document.addEventListener(
    "visibilitychange",
    () => {

        if (!document.hidden) {
            muatJadwal();
        }

    }
);


// ==========================================
// START
// ==========================================

muatJadwal();
mulaiAutoRefresh();