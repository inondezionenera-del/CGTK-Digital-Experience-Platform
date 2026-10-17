const API_BASE_URL = "http://127.0.0.1:8787/api/v1";

const totalAlumni = document.getElementById("totalAlumni");
const alumniList = document.getElementById("alumniList");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");

// Menampilkan status halaman
function showState(state) {
    loadingState.hidden = state !== "loading";
    errorState.hidden = state !== "error";
    emptyState.hidden = state !== "empty";
    alumniList.hidden = state === "loading" ||
                        state === "error" ||
                        state === "empty";
}

// Membuat elemen HTML dengan aman
function createElement(tag, className, text = "") {
    const element = document.createElement(tag);

    if (className) element.className = className;
    element.textContent = text;

    return element;
}

// Membuat tautan kontak
function createContactLink(label, href) {
    const link = document.createElement("a");

    link.textContent = label;
    link.href = href;
    link.target = href.startsWith("https://") ? "_blank" : "";
    link.rel = href.startsWith("https://") ? "noopener noreferrer" : "";

    return link;
}

// Membuat kartu booth
function renderBooth(booth, isActive) {
    const item = createElement(
        "article",
        isActive ? "booth-item current" : "booth-item"
    );

    const name = booth.nama || booth.name || "Nama booth tidak tersedia";
    const location = booth.lokasi || booth.location || "Lokasi belum tersedia";

    item.appendChild(createElement("h4", "", name));
    item.appendChild(createElement("p", "", location));

    if (isActive) {
        item.appendChild(
            createElement("strong", "active-badge", "BOOTH AKTIF")
        );
    }

    const status = booth.status || (booth.aktif ? "ACTIVE" : "");

    if (status) {
        item.appendChild(
            createElement(
                "p",
                "",
                status === "ACTIVE" ? "Status: BUKA" : `Status: ${status}`
            )
        );
    }

    return item;
}

// Membuat kartu alumni
function renderAlumni(alumni) {
    const card = createElement("article", "alumni-card");

    const name = alumni.nama || alumni.name || "Nama tidak tersedia";
    const campus = alumni.kampus || alumni.universitas || "-";
    const major = alumni.jurusan || "-";
    const year = alumni.tahun || alumni.angkatan || "-";
    const photo = alumni.foto || alumni.foto_url || alumni.photo_url;

    const profile = createElement("div", "alumni-profile");

    if (photo) {
        const image = document.createElement("img");
        image.src = photo;
        image.alt = `Foto ${name}`;
        image.loading = "lazy";
        image.width = 80;
        image.height = 80;
        profile.appendChild(image);
    }

    const identity = createElement("div", "alumni-identity");
    identity.appendChild(createElement("h3", "", name));
    identity.appendChild(
        createElement("p", "", `${campus} · ${major} · ${year}`)
    );

    profile.appendChild(identity);
    card.appendChild(profile);

    // Penempatan booth
    const boothSection = createElement("section", "booth-section");
    boothSection.appendChild(
        createElement("h4", "", "Booth sepanjang acara")
    );

    const booths = Array.isArray(alumni.booths)
        ? alumni.booths
        : Array.isArray(alumni.penempatan_booth)
            ? alumni.penempatan_booth
            : [];

    const activeBoothId =
        alumni.booth_aktif_id ??
        alumni.boothAktifId ??
        alumni.booth_aktif?.id ??
        alumni.boothAktif?.id ??
        null;

    if (booths.length > 0) {
        booths.forEach((booth) => {
            const isActive =
                booth.id != null &&
                activeBoothId != null &&
                String(booth.id) === String(activeBoothId);

            boothSection.appendChild(renderBooth(booth, isActive));
        });
    } else {
        boothSection.appendChild(
            createElement("p", "", "Informasi penempatan booth belum tersedia.")
        );
    }

    card.appendChild(boothSection);

    // Kontak alumni
    const phone = String(
        alumni.telepon || alumni.no_telepon || alumni.phone || ""
    ).trim();

    if (phone) {
        const contactSection = createElement("section", "contact-section");
        contactSection.appendChild(createElement("h4", "", "Kontak"));

        const phoneDigits = phone.replace(/\D/g, "");
        const whatsappNumber = phone.replace(/\D/g, "").replace(/^0/, "62");

        contactSection.appendChild(
            createContactLink(`Telepon: ${phone}`, `tel:${phoneDigits}`)
        );

        contactSection.appendChild(
            createContactLink(
                "Hubungi via WhatsApp",
                `https://wa.me/${whatsappNumber}`
            )
        );

        card.appendChild(contactSection);
    }

    return card;
}

// Mengambil dan menampilkan data alumni
async function loadAlumni() {
    showState("loading");

    try {
        const response = await fetch(`${API_BASE_URL}/lo/alumni`);
        const result = await response.json();

        if (!response.ok || result.sukses === false) {
            throw new Error(
                result.error?.pesan ||
                result.pesan ||
                "Gagal memuat data alumni."
            );
        }

        const alumni = Array.isArray(result)
            ? result
            : result.data;

        if (!Array.isArray(alumni)) {
            throw new Error("Format data alumni tidak sesuai.");
        }

        totalAlumni.textContent = alumni.length;
        alumniList.replaceChildren();

        if (alumni.length === 0) {
            emptyState.textContent =
                "Belum ada alumni dampingan. Hubungi Super Admin.";

            showState("empty");
            return;
        }

        alumni.forEach((item) => {
            alumniList.appendChild(renderAlumni(item));
        });

        showState("success");
    } catch (error) {
        totalAlumni.textContent = "0";
        alumniList.replaceChildren();
        errorState.textContent = error.message;
        showState("error");
    }
}

// Memuat data ketika halaman dibuka
loadAlumni();