
const API_BASE_URL = "http://127.0.0.1:8787/api/v1";

const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const boothContent = document.getElementById("boothContent");

const boothName = document.getElementById("boothName");
const boothEvent = document.getElementById("boothEvent");
const boothLocation = document.getElementById("boothLocation");
const boothStatus = document.getElementById("boothStatus");

const alumniList = document.getElementById("alumniList");
const emptyAlumni = document.getElementById("emptyAlumni");

const publicMaterials = document.getElementById("publicMaterials");
const emptyPublicMaterials = document.getElementById("emptyPublicMaterials");

const lockedMaterials = document.getElementById("lockedMaterials");
const lockedMaterialsInfo = document.getElementById("lockedMaterialsInfo");
const scannerSection = document.getElementById("scannerSection");

// Membaca ID booth dari URL
function getBoothId() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("id")) {
        return params.get("id");
    }

    const parts = window.location.pathname.split("/").filter(Boolean);
    const boothIndex = parts.lastIndexOf("booths");

    return boothIndex >= 0 ? parts[boothIndex + 1] : null;
}

function createElement(tag, text = "", className = "") {
    const element = document.createElement(tag);
    element.textContent = text;

    if (className) {
        element.className = className;
    }

    return element;
}

function getValue(object, keys, fallback = "") {
    for (const key of keys) {
        if (object?.[key] !== undefined && object[key] !== null) {
            return object[key];
        }
    }

    return fallback;
}

function showError(message) {
    loadingState.hidden = true;
    boothContent.hidden = true;
    errorState.textContent = message;
    errorState.hidden = false;
}

// Menampilkan identitas booth
function renderBoothDetails(data) {
    const booth = data.booth ?? data;

    boothName.textContent = getValue(
        booth,
        ["nama", "nama_booth", "name"],
        "Detail Booth"
    );

    const event = booth.event ?? booth.acara ?? {};

    boothEvent.textContent = getValue(
        event,
        ["nama", "name", "tipe"],
        getValue(booth, ["tipe_acara", "jenis_acara"], "Acara tidak tersedia")
    );

    boothLocation.textContent =
        "Lokasi: " +
        getValue(booth, ["lokasi", "location"], "Lokasi belum tersedia");

    const status = String(
        getValue(booth, ["status"], "UNKNOWN")
    ).toUpperCase();

    const isOpen = ["ACTIVE", "BUKA", "OPEN"].includes(status);

    boothStatus.textContent = `Status: ${isOpen ? "BUKA" : status === "CLOSED" || status === "TUTUP" ? "TUTUP" : status}`;
}

// Menampilkan alumni di booth
function renderAlumni(alumni) {
    alumniList.replaceChildren();

    if (!Array.isArray(alumni) || alumni.length === 0) {
        emptyAlumni.hidden = false;
        return;
    }

    emptyAlumni.hidden = true;

    alumni.forEach((person) => {
        const card = createElement("article", "", "alumni-card");

        const name = getValue(
            person,
            ["nama", "name"],
            "Nama alumni tidak tersedia"
        );

        const campus = getValue(
            person,
            ["kampus", "universitas", "nama_kampus"],
            ""
        );

        const year = getValue(
            person,
            ["tahun", "angkatan", "tahun_lulus"],
            ""
        );

        const photoUrl = getValue(
            person,
            ["foto_url", "foto", "photo_url"],
            ""
        );

        if (photoUrl) {
            const image = document.createElement("img");
            image.src = photoUrl;
            image.alt = `Foto ${name}`;
            image.loading = "lazy";
            image.width = 72;
            image.height = 72;
            card.appendChild(image);
        }

        card.appendChild(createElement("h3", name));

        if (campus || year) {
            card.appendChild(
                createElement(
                    "p",
                    [campus, year].filter(Boolean).join(" · ")
                )
            );
        }

        alumniList.appendChild(card);
    });
}

// Menampilkan materi yang dapat diakses
function renderMaterial(material, container) {
    const item = createElement("article", "", "material-item");

    const name = getValue(
        material,
        ["nama", "judul", "name", "title"],
        "Materi tanpa judul"
    );

    const type = String(
        getValue(material, ["tipe", "jenis", "type"], "")
    ).toUpperCase();

    const url = getValue(
        material,
        ["url", "file_url", "tautan"],
        ""
    );

    item.appendChild(createElement("h4", name));

    if (type === "LINK" && url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Buka Materi";
        item.appendChild(link);
    } else if (type === "FILE" && url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Buka PDF";
        item.appendChild(link);
    } else if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Buka Materi";
        item.appendChild(link);
    } else {
        item.appendChild(
            createElement("p", "Tautan materi belum tersedia.")
        );
    }

    container.appendChild(item);
}

// Menampilkan materi publik dan materi terkunci
function renderMaterials(data) {
    const publicItems = Array.isArray(data.publik)
        ? data.publik
        : [];

    publicMaterials.replaceChildren();

    publicItems.forEach((material) => {
        renderMaterial(material, publicMaterials);
    });

    emptyPublicMaterials.hidden = publicItems.length > 0;

    lockedMaterials.replaceChildren();
    lockedMaterialsInfo.hidden = true;
    scannerSection.hidden = true;

    const accessGranted = data.sudah_di_booth === true;
    const restricted = data.di_booth ?? {};

    if (accessGranted) {
        // Jika peserta sudah mengunjungi booth,
        // materi khusus ditampilkan seperti materi publik.
        const unlockedItems = Array.isArray(restricted)
            ? restricted
            : Array.isArray(restricted.materi)
                ? restricted.materi
                : Array.isArray(restricted.data)
                    ? restricted.data
                    : [];

        unlockedItems.forEach((material) => {
            renderMaterial(material, lockedMaterials);
        });

        if (unlockedItems.length === 0) {
            lockedMaterials.appendChild(
                createElement("p", "Tidak ada materi tambahan.")
            );
        }

        return;
    }

    // Materi terkunci tetap ditampilkan sebagai informasi.
    const lockedCount = Number(
        getValue(restricted, ["jumlah"], 0)
    );

    if (lockedCount > 0 || restricted.terkunci === true) {
        lockedMaterialsInfo.textContent =
            restricted.pesan ||
            `${lockedCount} materi terkunci. Scan QR di meja booth untuk membukanya.`;

        lockedMaterialsInfo.hidden = false;

        const lockedCard = createElement(
            "article",
            "",
            "locked-material-card"
        );

        lockedCard.setAttribute("aria-label", "Materi terkunci");

        lockedCard.appendChild(
            createElement("h4", "🔒 Materi terkunci")
        );

        lockedCard.appendChild(
            createElement("p", `${lockedCount} materi belum dapat diakses.`)
        );

        lockedMaterials.appendChild(lockedCard);
        scannerSection.hidden = false;
    }
}

// Mengambil detail booth dari API
async function loadBoothDetail() {
    const id = getBoothId();

    if (!id) {
        showError("ID booth tidak ditemukan pada alamat halaman.");
        return;
    }

    loadingState.hidden = false;
    errorState.hidden = true;
    boothContent.hidden = true;

    try {
        const response = await fetch(
            `${API_BASE_URL}/booths/${encodeURIComponent(id)}`
        );

        const result = await response.json();

        if (!response.ok || result.sukses === false) {
            throw new Error(
                result.error?.pesan ||
                result.pesan ||
                "Gagal memuat detail booth."
            );
        }

        const data = result.data ?? result;

        renderBoothDetails(data);

        const alumni = getValue(
            data,
            ["alumni", "representatives"],
            []
        );

        renderAlumni(alumni);
        renderMaterials(data);

        loadingState.hidden = true;
        boothContent.hidden = false;
    } catch (error) {
        showError(error.message);
    }
}

loadBoothDetail();
