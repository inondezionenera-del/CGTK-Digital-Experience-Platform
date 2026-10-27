const API_BASE_URL = "http://127.0.0.1:8787/api/v1";
const ANNOUNCEMENTS_ENDPOINT = `${API_BASE_URL}/announcements`;

const announcementList = document.getElementById("announcementList");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");

// Mengatur kondisi halaman
function showState(state) {
    loadingState.hidden = state !== "loading";
    errorState.hidden = state !== "error";
    emptyState.hidden = state !== "empty";
    announcementList.hidden = state !== "success";
}

// Membuat elemen HTML dengan aman
function createElement(tag, text = "", className = "") {
    const element = document.createElement(tag);
    element.textContent = text;

    if (className) {
        element.className = className;
    }

    return element;
}

// Mengambil nilai pertama yang tersedia
function getValue(object, keys, fallback = "") {
    for (const key of keys) {
        if (object?.[key] !== undefined && object[key] !== null) {
            return object[key];
        }
    }

    return fallback;
}

// Memeriksa apakah pengumuman bersifat darurat
function isEmergency(announcement) {
    const type = String(
        getValue(announcement, ["tipe", "jenis", "kategori", "type"], "")
    ).toUpperCase();

    return announcement.darurat === true ||
        announcement.is_emergency === true ||
        type === "DARURAT" ||
        type === "EMERGENCY";
}

// Format tanggal jika nilainya valid
function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeStyle: "short"
    }).format(date);
}

// Membuat kartu pengumuman
function renderAnnouncement(announcement) {
    const emergency = isEmergency(announcement);

    const card = createElement(
        "article",
        "",
        emergency ? "announcement-card emergency" : "announcement-card"
    );

    if (emergency) {
        card.appendChild(
            createElement("strong", "PENGUMUMAN DARURAT", "emergency-label")
        );
    }

    const title = getValue(
        announcement,
        ["judul", "title", "nama"],
        "Pengumuman tanpa judul"
    );

    const content = getValue(
        announcement,
        ["isi", "konten", "pesan", "content"],
        ""
    );

    const date = getValue(
        announcement,
        ["diterbitkan_pada", "created_at", "tanggal", "published_at"],
        ""
    );

    card.appendChild(createElement("h3", title));
    card.appendChild(createElement("p", content));

    const formattedDate = formatDate(date);

    if (formattedDate) {
        const time = document.createElement("time");
        time.dateTime = date;
        time.textContent = formattedDate;
        card.appendChild(time);
    }

    return card;
}

// Memuat daftar pengumuman
async function loadAnnouncements() {
    showState("loading");
    errorState.textContent = "";
    announcementList.replaceChildren();

    try {
        const response = await fetch(ANNOUNCEMENTS_ENDPOINT);
        const result = await response.json();

        if (!response.ok || result.sukses === false) {
            throw new Error(
                result.error?.pesan ||
                result.pesan ||
                "Gagal memuat pengumuman."
            );
        }

        const data = Array.isArray(result)
            ? result
            : result.data;

        if (!Array.isArray(data)) {
            throw new Error("Format data pengumuman tidak sesuai.");
        }

        // Urutan dari API dipertahankan.
        if (data.length === 0) {
            showState("empty");
            return;
        }

        data.forEach((announcement) => {
            announcementList.appendChild(
                renderAnnouncement(announcement)
            );
        });

        showState("success");
    } catch (error) {
        errorState.textContent = error.message;
        showState("error");
    }
}

loadAnnouncements();