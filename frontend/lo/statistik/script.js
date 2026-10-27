const API_BASE_URL = "http://127.0.0.1:8787/api/v1";

const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const disabledState = document.getElementById("disabledState");
const statsContent = document.getElementById("statsContent");
const totalAlumni = document.getElementById("totalAlumni");
const totalVisitors = document.getElementById("totalVisitors");
const boothList = document.getElementById("boothList");
const lastUpdated = document.getElementById("lastUpdated");

let refreshTimer = null;
let requestController = null;

// Mengatur kondisi yang terlihat di halaman
function showState(state) {
    loadingState.hidden = state !== "loading";
    errorState.hidden = state !== "error";
    emptyState.hidden = state !== "empty";
    disabledState.hidden = state !== "disabled";
    statsContent.hidden = state !== "success";
}

// Membuat elemen HTML dengan aman
function createElement(tag, text = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

// Mengambil nilai pertama yang tersedia
function getValue(object, keys, fallback = "-") {
    for (const key of keys) {
        if (object?.[key] !== undefined && object[key] !== null) {
            return object[key];
        }
    }

    return fallback;
}

// Format angka
function formatNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? new Intl.NumberFormat("id-ID").format(number)
        : value;
}

// Menampilkan jam ramai
function renderBusyHours(hours) {
    const section = createElement("section");
    section.appendChild(createElement("h4", "Jam Ramai"));

    if (!Array.isArray(hours) || hours.length === 0) {
        section.appendChild(createElement("p", "Belum ada data jam ramai."));
        return section;
    }

    const list = document.createElement("ul");

    hours.forEach((hour) => {
        const time = getValue(hour, ["jam", "waktu", "hour"], "-");
        const count = getValue(
            hour,
            ["jumlah_pengunjung", "jumlah", "total", "count"],
            0
        );

        list.appendChild(
            createElement(
                "li",
                `${time}: ${formatNumber(count)} pengunjung`
            )
        );
    });

    section.appendChild(list);
    return section;
}

// Membuat ringkasan satu booth
function renderBooth(booth) {
    const article = createElement("article");
    const name = getValue(
        booth,
        ["nama_booth", "nama", "name"],
        "Booth tanpa nama"
    );

    const location = getValue(
        booth,
        ["lokasi", "location"],
        "Lokasi belum tersedia"
    );

    const status = String(
        getValue(booth, ["status"], "UNKNOWN")
    ).toUpperCase();

    article.appendChild(createElement("h3", name));
    article.appendChild(createElement("p", `Lokasi: ${location}`));

    article.appendChild(
        createElement(
            "p",
            `Status: ${
                status === "ACTIVE" || status === "BUKA"
                    ? "BUKA"
                    : status === "CLOSED" || status === "TUTUP"
                        ? "TUTUP"
                        : status
            }`
        )
    );

    // Nama alumni yang ditugaskan, bukan nama peserta pengunjung.
    const alumni = getValue(
        booth,
        ["alumni", "nama_alumni", "alumni_dampingan"],
        []
    );

    article.appendChild(createElement("h4", "Alumni Bertugas"));

    if (Array.isArray(alumni) && alumni.length > 0) {
        const list = document.createElement("ul");

        alumni.forEach((person) => {
            const name = typeof person === "string"
                ? person
                : getValue(person, ["nama", "name"], "Alumni");

            list.appendChild(createElement("li", name));
        });

        article.appendChild(list);
    } else if (typeof alumni === "string" && alumni.trim()) {
        article.appendChild(createElement("p", alumni));
    } else {
        article.appendChild(createElement("p", "Data alumni tidak tersedia."));
    }

    const today = getValue(
        booth,
        ["pengunjung_hari_ini", "hari_ini", "today"],
        0
    );

    const total = getValue(
        booth,
        ["total_pengunjung", "total", "total_visitors"],
        0
    );

    article.appendChild(
        createElement("p", `Pengunjung hari ini: ${formatNumber(today)}`)
    );

    article.appendChild(
        createElement("p", `Total pengunjung: ${formatNumber(total)}`)
    );

    const busyHours = getValue(
        booth,
        ["jam_sibuk", "jam_ramai", "busy_hours"],
        []
    );

    article.appendChild(renderBusyHours(busyHours));

    return article;
}

// Menampilkan seluruh statistik
function renderStatistics(data) {
    totalAlumni.textContent = formatNumber(
        getValue(data, ["jumlah_alumni", "total_alumni"], 0)
    );

    totalVisitors.textContent = formatNumber(
        getValue(
            data,
            ["total_pengunjung", "jumlah_pengunjung", "total_visitors"],
            0
        )
    );

    const booths = getValue(
        data,
        ["booths", "daftar_booth", "statistik_booth"],
        []
    );

    boothList.replaceChildren();

    if (!Array.isArray(booths) || booths.length === 0) {
        showState("empty");
        return;
    }

    booths.forEach((booth) => {
        boothList.appendChild(renderBooth(booth));
    });

    lastUpdated.textContent =
        `Terakhir diperbarui: ${new Date().toLocaleTimeString("id-ID")}`;

    showState("success");
}

// Memuat statistik dari sumber data
async function loadStatistics() {
    if (document.hidden) return;

    if (requestController) {
        requestController.abort();
    }

    requestController = new AbortController();
    showState("loading");

    try {
        const response = await fetch(
            `${API_BASE_URL}/lo/statistik`,
            { signal: requestController.signal }
        );

        const result = await response.json();

        if (!response.ok || result.sukses === false) {
            throw new Error(
                result.error?.pesan ||
                result.pesan ||
                "Gagal memuat statistik."
            );
        }

        const data = result.data ?? result;

        if (result.mode_hemat === true || data.mode_hemat === true) {
            showState("disabled");
            return;
        }

        renderStatistics(data);
    } catch (error) {
        if (error.name === "AbortError") return;

        errorState.textContent = error.message;
        showState("error");
    } finally {
        requestController = null;

        if (!document.hidden && loadingState.hidden === false) {
            loadingState.hidden = true;
        }
    }
}

// Memulai pembaruan berkala
function startRefresh() {
    stopRefresh();

    loadStatistics();

    refreshTimer = setInterval(() => {
        if (!document.hidden) {
            loadStatistics();
        }
    }, 60000);
}

// Menghentikan pembaruan berkala
function stopRefresh() {
    if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopRefresh();

        if (requestController) {
            requestController.abort();
        }
    } else {
        startRefresh();
    }
});

// Jalankan saat halaman dibuka
startRefresh();