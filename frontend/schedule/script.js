/* =====================================================
   CONFIG
===================================================== */

const API_BASE_URL = ""; 
// Jika backend sudah punya URL:
// const API_BASE_URL = "https://domain-backend-kamu.workers.dev";


/* =====================================================
   STATE
===================================================== */

let events = [];
let sessions = [];

let selectedDate = null;


/* =====================================================
   ELEMENT
===================================================== */

const dayTabs = document.getElementById("dayTabs");
const scheduleList = document.getElementById("scheduleList");


/* =====================================================
   INIT
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    loadSchedule();
});


/* =====================================================
   LOAD SCHEDULE
===================================================== */

async function loadSchedule() {
    tampilkanLoading();

    try {
        const [eventsData, sessionsData] = await Promise.all([
            fetchAPI("/events"),
            fetchAPI("/events/sessions")
        ]);

        events = ambilData(eventsData);
        sessions = ambilData(sessionsData);

        prosesSchedule();

    } catch (error) {
        tampilkanError(error);
    }
}


/* =====================================================
   FETCH API
===================================================== */

async function fetchAPI(endpoint) {

    const response = await fetch(
        `${API_BASE_URL}${endpoint}`
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.pesan ||
            data?.message ||
            "Terjadi kesalahan saat mengambil data."
        );
    }

    return data;
}


/* =====================================================
   AMBIL DATA
===================================================== */

function ambilData(response) {

    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    if (Array.isArray(response?.items)) {
        return response.items;
    }

    return [];
}


/* =====================================================
   PROSES SCHEDULE
===================================================== */

function prosesSchedule() {

    /*
        DRAFT tidak boleh ditampilkan
    */

    const visibleSessions = sessions.filter(
        session => session.status !== "DRAFT"
    );

    /*
        Gabungkan session dengan event
    */

    const mergedSessions = visibleSessions.map(session => {

        const event = events.find(
            event =>
                String(event.id) === String(session.event_id)
        );

        return {
            ...session,
            event
        };
    });

    /*
        Ambil tanggal unik
    */

    const uniqueDates = [
        ...new Set(
            mergedSessions
                .map(session => ambilTanggal(session))
                .filter(Boolean)
        )
    ].sort();

    /*
        Jika tidak ada jadwal
    */

    if (uniqueDates.length === 0) {
        dayTabs.innerHTML = "";
        tampilkanEmpty();
        return;
    }

    /*
        Tanggal pertama otomatis dipilih
    */

    if (
        !selectedDate ||
        !uniqueDates.includes(selectedDate)
    ) {
        selectedDate = uniqueDates[0];
    }

    /*
        Buat tab hanya jika lebih dari satu hari
    */

    if (uniqueDates.length > 1) {
        renderDayTabs(uniqueDates);
    } else {
        dayTabs.innerHTML = "";
    }

    /*
        Tampilkan session sesuai tanggal
    */

    renderSessions(
        mergedSessions,
        selectedDate
    );
}


/* =====================================================
   AMBIL TANGGAL
===================================================== */

function ambilTanggal(session) {

    /*
        Menyesuaikan kemungkinan nama field API.
        Prioritas start_at karena session memiliki waktu mulai.
    */

    const value =
        session.start_at ||
        session.mulai ||
        session.start ||
        session.tanggal;

    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().split("T")[0];
}


/* =====================================================
   RENDER DAY TABS
===================================================== */

function renderDayTabs(dates) {

    dayTabs.innerHTML = "";

    dates.forEach((date, index) => {

        const button = document.createElement("button");

        button.type = "button";
        button.className = "day-tab";

        if (date === selectedDate) {
            button.classList.add("active");
        }

        button.textContent = `Hari ${index + 1}`;

        button.addEventListener("click", () => {

            selectedDate = date;

            renderDayTabs(dates);

            /*
                Ambil kembali data session
                untuk tanggal yang dipilih
            */

            const visibleSessions = sessions
                .filter(
                    session =>
                        session.status !== "DRAFT"
                )
                .map(session => {

                    const event = events.find(
                        event =>
                            String(event.id) ===
                            String(session.event_id)
                    );

                    return {
                        ...session,
                        event
                    };
                });

            renderSessions(
                visibleSessions,
                selectedDate
            );
        });

        dayTabs.appendChild(button);
    });
}


/* =====================================================
   RENDER SESSIONS
===================================================== */

function renderSessions(
    mergedSessions,
    date
) {

    const filteredSessions =
        mergedSessions
            .filter(
                session =>
                    ambilTanggal(session) === date
            )
            .sort(
                (a, b) =>
                    ambilWaktu(a) -
                    ambilWaktu(b)
            );

    if (filteredSessions.length === 0) {
        tampilkanEmpty();
        return;
    }

    scheduleList.innerHTML = "";

    filteredSessions.forEach(session => {

        const card =
            buatSessionCard(session);

        scheduleList.appendChild(card);
    });
}


/* =====================================================
   BUAT SESSION CARD
===================================================== */

function buatSessionCard(session) {

    const card =
        document.createElement("article");

    const isLive =
        session.status === "ACTIVE";

    const isClosed =
        session.status === "CLOSED";

    card.className = "session-card";

    if (isLive) {
        card.classList.add("live");
    }

    if (isClosed) {
        card.classList.add("closed");
    }

    /*
        TYPE / EVENT
    */

    const eventType =
        session.event?.type ||
        session.event?.jenis ||
        "";

    const eventName =
        session.event?.name ||
        session.event?.nama ||
        "";

    /*
        SESSION NAME
    */

    const sessionName =
        session.name ||
        session.nama ||
        "Acara";

    /*
        LOCATION
    */

    const location =
        session.location ||
        session.lokasi ||
        "-";

    /*
        TIME
    */

    const startTime =
        formatTime(
            session.start_at ||
            session.mulai ||
            session.start
        );

    const endTime =
        formatTime(
            session.end_at ||
            session.selesai ||
            session.end
        );

    /*
        STATUS
    */

    let statusHTML = "";

    if (isLive) {

        statusHTML = `
            <span class="session-status live">
                <span class="live-dot"></span>
                LIVE
            </span>
        `;

    } else if (isClosed) {

        statusHTML = `
            <span class="session-status closed">
                Selesai
            </span>
        `;
    }

    /*
        ATTENDANCE
    */

    let attendanceHTML = "";

    if (session.saya_sudah_hadir === true) {

        attendanceHTML = `
            <div class="attendance-status">
                <div class="attendance-done">
                    ✓ Saya sudah hadir
                </div>
            </div>
        `;
    }

    /*
        CARD
    */

    card.innerHTML = `
        <div class="session-top">

            <div class="session-type">
                ${escapeHTML(
                    eventType || eventName
                )}
            </div>

            ${statusHTML}

        </div>

        <h2 class="session-name">
            ${escapeHTML(sessionName)}
        </h2>

        <div class="session-info">

            <div class="session-info-item">
                <span class="session-info-icon">
                    🕐
                </span>

                <span>
                    ${escapeHTML(
                        `${startTime} — ${endTime}`
                    )}
                </span>
            </div>

            <div class="session-info-item">
                <span class="session-info-icon">
                    📍
                </span>

                <span>
                    ${escapeHTML(location)}
                </span>
            </div>

        </div>

        ${attendanceHTML}
    `;

    return card;
}


/* =====================================================
   FORMAT TIME
===================================================== */

function formatTime(value) {

    if (!value) {
        return "--:--";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleTimeString(
        "id-ID",
        {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );
}


/* =====================================================
   AMBIL WAKTU
===================================================== */

function ambilWaktu(session) {

    const value =
        session.start_at ||
        session.mulai ||
        session.start;

    if (!value) {
        return 0;
    }

    const time =
        new Date(value).getTime();

    return Number.isNaN(time)
        ? 0
        : time;
}


/* =====================================================
   LOADING
===================================================== */

function tampilkanLoading() {

    scheduleList.innerHTML = `
        <div class="loading-state">
            Memuat jadwal acara...
        </div>
    `;
}


/* =====================================================
   EMPTY
===================================================== */

function tampilkanEmpty() {

    scheduleList.innerHTML = `
        <div class="empty-state">

            <div class="empty-state-icon">
                📅
            </div>

            <h3>
                Belum ada jadwal
            </h3>

            <p>
                Belum ada acara yang tersedia
                untuk ditampilkan.
            </p>

        </div>
    `;
}


/* =====================================================
   ERROR
===================================================== */

function tampilkanError(error) {

    console.error(error);

    const pesan =
        error?.message ||
        "Terjadi kesalahan.";

    scheduleList.innerHTML = `
        <div class="error-state">
            ${escapeHTML(pesan)}
        </div>
    `;
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =====================================================
   AUTO REFRESH
   Setiap 60 detik hanya ketika halaman terlihat
===================================================== */

setInterval(() => {

    if (document.hidden) {
        return;
    }

    loadSchedule();

}, 60000);


/* =====================================================
   KETIKA TAB KEMBALI TERLIHAT
===================================================== */

document.addEventListener(
    "visibilitychange",
    () => {

        if (!document.hidden) {
            loadSchedule();
        }

    }
);