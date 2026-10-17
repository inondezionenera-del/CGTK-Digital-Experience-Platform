
const API_BASE_URL = "http://127.0.0.1:8787/api/v1";
const BOOTHS_ENDPOINT = `${API_BASE_URL}/booths`;

const searchInput = document.getElementById("searchBooth");
const boothList = document.getElementById("boothList");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const eventTabs = document.querySelectorAll(".event-tab");

let allBooths = [];
let selectedEvent = "EXPO_KAMPUS";

// Mengatur pesan dan daftar yang terlihat
function showState(state) {
    loadingState.hidden = state !== "loading";
    errorState.hidden = state !== "error";
    emptyState.hidden = state !== "empty";
    boothList.hidden = state !== "success";
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

// Mengambil nilai dari beberapa kemungkinan nama properti
function getValue(object, keys, fallback = "") {
    for (const key of keys) {
        if (object?.[key] !== undefined && object[key] !== null) {
            return object[key];
        }
    }

    return fallback;
}

// Menentukan tipe acara booth
function getEventType(booth) {
    return String(
        getValue(booth, [
            "tipe_acara",
            "jenis_acara",
            "event_type",
            "tipe",
            "event.tipe",
        ], "")
    ).toUpperCase();
}

// Membaca properti bertingkat seperti event.tipe
function getNestedValue(object, path) {
    return path.split(".").reduce(
        (value, key) => value?.[key],
        object
    );
}

// Menghitung jumlah alumni
function getAlumniCount(booth) {
    const count = getValue(
        booth,
        ["jumlah_alumni", "alumni_count"],
        null
    );

    if (count !== null) return Number(count) || 0;

    const alumni = getValue(booth, ["alumni", "representatives"], []);
    return Array.isArray(alumni) ? alumni.length : 0;
}

// Menghitung jumlah materi
function getMaterialCount(booth) {
    const count = getValue(
        booth,
        ["jumlah_materi", "materi_count", "total_materi"],
        null
    );

    if (count !== null) return Number(count) || 0;

    const materials = getValue(booth, ["materi", "materials"], []);
    return Array.isArray(materials) ? materials.length : 0;
}

// Menentukan status booth
function isBoothOpen(booth) {
    const status = String(
        getValue(booth, ["status"], "")
    ).toUpperCase();

    return status === "ACTIVE" || status === "BUKA" || status === "OPEN";
}

// Membuat tautan detail booth
function getDetailUrl(booth) {
    const id = getValue(booth, ["id", "booth_id"], "");

    return `id/index.html?id=${encodeURIComponent(id)}`;
}

// Membuat satu kartu booth
function renderBooth(booth) {
    const card = createElement(
        "article",
        "",
        isBoothOpen(booth) ? "booth-card" : "booth-card closed"
    );

    const name = getValue(
        booth,
        ["nama", "nama_booth", "name"],
        "Booth tanpa nama"
    );

    const location = getValue(
        booth,
        ["lokasi", "location"],
        "Lokasi belum tersedia"
    );

    const statusText = isBoothOpen(booth) ? "BUKA" : "TUTUP";

    card.appendChild(createElement("h3", name));
    card.appendChild(createElement("p", location));
    card.appendChild(createElement("p", `Status: ${statusText}`));
    card.appendChild(
        createElement("p", `${getAlumniCount(booth)} alumni`)
    );
    card.appendChild(
        createElement("p", `${getMaterialCount(booth)} materi`)
    );

    const detailLink = document.createElement("a");
    detailLink.href = getDetailUrl(booth);
    detailLink.textContent = "Lihat Detail Booth";
    card.appendChild(detailLink);

    return card;
}

// Menampilkan booth sesuai tab dan pencarian
function renderBooths() {
    const keyword = searchInput.value.trim().toLowerCase();

    const filteredBooths = allBooths.filter((booth) => {
        const eventType = getEventType(booth);

        const matchesEvent = eventType === selectedEvent;

        const name = String(
            getValue(booth, ["nama", "nama_booth", "name"], "")
        ).toLowerCase();

        const location = String(
            getValue(booth, ["lokasi", "location"], "")
        ).toLowerCase();

        const matchesSearch =
            name.includes(keyword) || location.includes(keyword);

        return matchesEvent && matchesSearch;
    });

    boothList.replaceChildren();

    if (filteredBooths.length === 0) {
        showState("empty");
        return;
    }

    filteredBooths.forEach((booth) => {
        boothList.appendChild(renderBooth(booth));
    });

    showState("success");
}

// Memuat daftar booth
async function loadBooths() {
    showState("loading");

    try {
        const response = await fetch(BOOTHS_ENDPOINT);
        const result = await response.json();

        if (!response.ok || result.sukses === false) {
            throw new Error(
                result.error?.pesan ||
                result.pesan ||
                "Gagal memuat daftar booth."
            );
        }

        const data = Array.isArray(result)
            ? result
            : result.data;

        if (!Array.isArray(data)) {
            throw new Error("Format data booth tidak sesuai.");
        }

        allBooths = data;
        renderBooths();
    } catch (error) {
        errorState.textContent = error.message;
        showState("error");
    }
}

// Pencarian langsung saat pengguna mengetik
searchInput.addEventListener("input", renderBooths);

// Mengganti tab acara
eventTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        selectedEvent = tab.dataset.event;

        eventTabs.forEach((item) => {
            item.setAttribute(
                "aria-pressed",
                String(item === tab)
            );
        });

        renderBooths();
    });
});

// Mengambil properti bertingkat untuk tipe acara
function normalizeEventType(booth) {
    return String(
        getNestedValue(booth, "event.tipe") ??
        getNestedValue(booth, "acara.tipe") ??
        booth.tipe_acara ??
        booth.jenis_acara ??
        booth.event_type ??
        booth.tipe ??
        ""
    ).toUpperCase();
}

// Jalankan halaman
loadBooths();
