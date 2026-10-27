const API_BASE_URL = "http://127.0.0.1:8787/api/v1";
const BOOTHS_ENDPOINT = `${API_BASE_URL}/booths`;

// Elemen HTML
const boothList = document.getElementById("boothList");
const posterContainer = document.getElementById("posterContainer");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const selectionCount = document.getElementById("selectionCount");

const selectAllButton = document.getElementById("selectAllButton");
const deselectAllButton = document.getElementById("deselectAllButton");
const printAllButton = document.getElementById("printAllButton");
const printSelectedButton = document.getElementById("printSelectedButton");

let booths = [];
let selectedBoothIds = new Set();

// Membuat elemen dengan aman
function createElement(tag, text = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

// Mengambil nilai properti
function getValue(object, keys, fallback = "") {
    for (const key of keys) {
        if (object?.[key] !== undefined && object[key] !== null) {
            return object[key];
        }
    }

    return fallback;
}

// Mengambil ID booth
function getBoothId(booth) {
    return String(getValue(booth, ["id", "booth_id"], ""));
}

// Mengambil nama booth
function getBoothName(booth) {
    return getValue(
        booth,
        ["nama", "nama_booth", "name"],
        "Booth tanpa nama"
    );
}

// Mengambil kode cadangan
function getBoothCode(booth) {
    return getValue(
        booth,
        ["kode", "kode_booth", "code"],
        ""
    );
}

// Mengambil URL QR dari data booth
function getQrUrl(booth) {
    return getValue(
        booth,
        ["qr_url", "qr_code_url", "qr_image_url"],
        ""
    );
}

// Menampilkan kondisi halaman
function showState(state) {
    loadingState.hidden = state !== "loading";
    errorState.hidden = state !== "error";
    emptyState.hidden = state !== "empty";
    boothList.hidden = state !== "success";
}

// Menghitung dan menampilkan jumlah pilihan
function updateSelectionCount() {
    selectionCount.textContent =
        `${selectedBoothIds.size} booth dipilih`;
}

// Membuat checkbox satu booth
function renderBoothCheckbox(booth) {
    const id = getBoothId(booth);
    const label = document.createElement("label");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.value = id;
    checkbox.checked = selectedBoothIds.has(id);
    checkbox.disabled = !id;

    checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
            selectedBoothIds.add(id);
        } else {
            selectedBoothIds.delete(id);
        }

        updateSelectionCount();
        renderPosters();
    });

    label.appendChild(checkbox);
    label.appendChild(
        createElement("span", ` ${getBoothName(booth)} ${getBoothCode(booth)}`)
    );

    return label;
}

// Mengambil booth yang dipilih
function getSelectedBooths() {
    return booths.filter((booth) =>
        selectedBoothIds.has(getBoothId(booth))
    );
}

// Membuat satu poster
function renderPoster(booth) {
    const poster = createElement("article");
    poster.className = "booth-poster";

    const title = createElement("h1", getBoothName(booth));
    poster.appendChild(title);

    const qrUrl = getQrUrl(booth);
    const qrLink = getValue(
        booth,
        ["qr_url", "qr_link", "url_qr"],
        ""
    );

    if (qrUrl) {
        const image = document.createElement("img");

        image.src = qrUrl;
        image.alt = `QR Code ${getBoothName(booth)}`;
        image.width = 400;
        image.height = 400;

        image.style.width = "10cm";
        image.style.height = "10cm";
        image.style.objectFit = "contain";

        poster.appendChild(image);
    } else if (qrLink) {
        const image = document.createElement("img");

        image.src =
            "https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=" +
            encodeURIComponent(qrLink);

        image.alt = `QR Code ${getBoothName(booth)}`;
        image.width = 600;
        image.height = 600;

        image.style.width = "10cm";
        image.style.height = "10cm";
        image.style.objectFit = "contain";

        poster.appendChild(image);
    } else {
        poster.appendChild(
            createElement(
                "p",
                "QR belum tersedia untuk booth ini."
            )
        );
    }

    poster.appendChild(
        createElement("p", "Scan untuk membuka materi")
    );

    poster.appendChild(
        createElement("p", "Kamera bermasalah? Ketik kode:")
    );

    const code = getBoothCode(booth);

    const codeElement = createElement(
        "p",
        code || "Kode booth belum tersedia"
    );

    codeElement.style.fontSize = "28pt";
    codeElement.style.fontWeight = "bold";

    poster.appendChild(codeElement);

    return poster;
}

// Menampilkan pratinjau poster
function renderPosters() {
    posterContainer.replaceChildren();

    getSelectedBooths().forEach((booth) => {
        posterContainer.appendChild(renderPoster(booth));
    });
}

// Memilih semua booth
selectAllButton.addEventListener("click", () => {
    booths.forEach((booth) => {
        const id = getBoothId(booth);

        if (id) selectedBoothIds.add(id);
    });

    renderBoothList();
    updateSelectionCount();
    renderPosters();
});

// Membatalkan semua pilihan
deselectAllButton.addEventListener("click", () => {
    selectedBoothIds.clear();

    renderBoothList();
    updateSelectionCount();
    renderPosters();
});

// Menggambar ulang daftar booth
function renderBoothList() {
    boothList.replaceChildren();

    booths.forEach((booth) => {
        boothList.appendChild(renderBoothCheckbox(booth));
    });
}

// Mencetak poster
function printPosters(includeAll = false) {
    const selected = includeAll ? booths : getSelectedBooths();

    if (selected.length === 0) {
        alert("Pilih minimal satu booth sebelum mencetak.");
        return;
    }

    renderPrintDocument(selected);
    window.print();
}

// Menyusun dokumen cetak terpisah dari daftar pilihan
function renderPrintDocument(selectedBooths) {
    posterContainer.replaceChildren();

    selectedBooths.forEach((booth) => {
        posterContainer.appendChild(renderPoster(booth));
    });
}

printAllButton.addEventListener("click", () => {
    printPosters(true);
});

printSelectedButton.addEventListener("click", () => {
    printPosters(false);
});

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
            throw new Error("Format daftar booth tidak sesuai.");
        }

        booths = data;
        showState(booths.length ? "success" : "empty");
        renderBoothList();
        updateSelectionCount();
        renderPosters();
    } catch (error) {
        errorState.textContent = error.message;
        showState("error");
    }
}

loadBooths();