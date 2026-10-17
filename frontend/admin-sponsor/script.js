// ==========================================
// CGTK 2027 - ADMIN SPONSOR
// Frontend demo: belum terhubung ke backend
// ==========================================

// Elemen utama
const formPanel = document.getElementById("formPanel");
const sponsorForm = document.getElementById("sponsorForm");
const tableBody = document.getElementById("sponsorTableBody");
const emptyState = document.getElementById("emptyState");
const sponsorPreview = document.getElementById("sponsorPreview");
const toast = document.getElementById("toast");

// Input form
const sponsorId = document.getElementById("sponsorId");
const sponsorName = document.getElementById("sponsorName");
const sponsorTier = document.getElementById("sponsorTier");
const sponsorLogo = document.getElementById("sponsorLogo");
const sponsorUrl = document.getElementById("sponsorUrl");
const sponsorOrder = document.getElementById("sponsorOrder");
const sponsorActive = document.getElementById("sponsorActive");

// Preview logo
const logoPreview = document.getElementById("logoPreview");
const previewImage = document.getElementById("previewImage");
const previewFileName = document.getElementById("previewFileName");
const logoError = document.getElementById("logoError");
const placementError = document.getElementById("placementError");

// Filter
const searchInput = document.getElementById("searchInput");
const tierFilter = document.getElementById("tierFilter");
const statusFilter = document.getElementById("statusFilter");

// Data sementara untuk demo.
// Data akan hilang jika halaman dimuat ulang.
let sponsors = [];
let nextId = 1;
let selectedLogo = null;
let selectedLogoName = "";
let logoRemoved = false;
let toastTimeout;

// ==========================================
// 1. NOTIFIKASI
// ==========================================

function showToast(message, isError = false) {
    clearTimeout(toastTimeout);

    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("show");

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// ==========================================
// 2. FORM TAMBAH DAN EDIT
// ==========================================

function openForm(sponsor = null) {
    sponsorForm.reset();

    selectedLogo = null;
    selectedLogoName = "";
    logoRemoved = false;

    logoError.textContent = "";
    placementError.textContent = "";
    sponsorLogo.value = "";

    sponsorId.value = sponsor ? sponsor.id : "";
    document.getElementById("formTitle").textContent =
        sponsor ? "Edit Sponsor" : "Tambah Sponsor";

    document.getElementById("saveBtn").textContent =
        sponsor ? "Simpan Perubahan" : "Simpan Sponsor";

    sponsorName.value = sponsor ? sponsor.nama : "";
    sponsorTier.value = sponsor ? sponsor.tier : "";
    sponsorUrl.value = sponsor ? sponsor.url : "";
    sponsorOrder.value = sponsor ? sponsor.urutan : 1;
    sponsorActive.checked = sponsor ? sponsor.aktif : true;

    document.querySelectorAll('input[name="placement"]').forEach(input => {
        input.checked = sponsor
            ? sponsor.penempatan.includes(input.value)
            : false;
    });

    if (sponsor && sponsor.logo) {
        selectedLogo = sponsor.logo;
        selectedLogoName = sponsor.logoNama || "Logo tersimpan";
        updateLogoPreview(selectedLogo, selectedLogoName);
    } else {
        clearLogoPreview();
    }

    formPanel.classList.add("is-open");
    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    sponsorName.focus({ preventScroll: true });
}

function closeForm() {
    formPanel.classList.remove("is-open");
    sponsorForm.reset();

    selectedLogo = null;
    selectedLogoName = "";
    logoRemoved = false;

    clearLogoPreview();
    logoError.textContent = "";
    placementError.textContent = "";
}

function getSelectedPlacements() {
    return Array.from(
        document.querySelectorAll('input[name="placement"]:checked')
    ).map(input => input.value);
}

// ==========================================
// 3. VALIDASI DAN PREVIEW LOGO
// ==========================================

function updateLogoPreview(src, fileName) {
    previewImage.src = src;
    previewFileName.textContent = fileName;
    logoPreview.hidden = false;
}

function clearLogoPreview() {
    previewImage.removeAttribute("src");
    previewFileName.textContent = "";
    logoPreview.hidden = true;
}

function validateLogo(file) {
    if (!file) return "Pilih file logo terlebih dahulu.";

    const extension = file.name.split(".").pop().toLowerCase();
    const validExtension = ["png", "svg"].includes(extension);

    const validMime =
        file.type === "image/png" ||
        file.type === "image/svg+xml";

    if (!validExtension || !validMime) {
        return "Format logo harus PNG atau SVG.";
    }

    if (file.size === 0) {
        return "File logo kosong atau tidak valid.";
    }

    if (file.size > 500 * 1024) {
        return "Ukuran logo melebihi batas maksimal 500 KB.";
    }

    return "";
}

sponsorLogo.addEventListener("change", () => {
    logoError.textContent = "";

    const file = sponsorLogo.files[0];

    if (!file) return;

    const error = validateLogo(file);

    if (error) {
        logoError.textContent = error;
        sponsorLogo.value = "";
        return;
    }

    // File dibaca sebagai data URL untuk preview lokal.
    const reader = new FileReader();

    reader.onload = () => {
        selectedLogo = reader.result;
        selectedLogoName = file.name;
        logoRemoved = false;

        updateLogoPreview(selectedLogo, selectedLogoName);
    };

    reader.onerror = () => {
        selectedLogo = null;
        selectedLogoName = "";
        sponsorLogo.value = "";
        logoError.textContent = "Logo gagal dibaca. Silakan coba lagi.";
        clearLogoPreview();
    };

    reader.readAsDataURL(file);
});

document.getElementById("removeLogoBtn").addEventListener("click", () => {
    selectedLogo = null;
    selectedLogoName = "";
    logoRemoved = true;

    sponsorLogo.value = "";
    clearLogoPreview();

    logoError.textContent = "";
});

// ==========================================
// 4. SIMPAN SPONSOR
// ==========================================

sponsorForm.addEventListener("submit", event => {
    event.preventDefault();

    logoError.textContent = "";
    placementError.textContent = "";

    const id = sponsorId.value ? Number(sponsorId.value) : null;
    const existingSponsor = sponsors.find(item => item.id === id);

    const nama = sponsorName.value.trim();
    const tier = sponsorTier.value;
    const url = sponsorUrl.value.trim();
    const urutan = Number(sponsorOrder.value);
    const penempatan = getSelectedPlacements();

    if (!nama) {
        showToast("Nama sponsor wajib diisi.", true);
        sponsorName.focus();
        return;
    }

    if (!tier) {
        showToast("Pilih tingkatan sponsor.", true);
        sponsorTier.focus();
        return;
    }

    if (!Number.isInteger(urutan) || urutan < 1 || urutan > 9999) {
        showToast("Urutan harus berupa bilangan bulat 1–9999.", true);
        sponsorOrder.focus();
        return;
    }

    if (url) {
        try {
            const parsedUrl = new URL(url);

            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                throw new Error("URL tidak valid");
            }
        } catch {
            showToast("Masukkan URL sponsor yang valid.", true);
            sponsorUrl.focus();
            return;
        }
    }

    if (penempatan.length === 0) {
        placementError.textContent =
            "Pilih minimal satu penempatan sponsor.";

        showToast("Penempatan sponsor wajib dipilih.", true);
        return;
    }

    if (sponsorLogo.files[0]) {
        const error = validateLogo(sponsorLogo.files[0]);

        if (error) {
            logoError.textContent = error;
            showToast(error, true);
            return;
        }
    }

    // Pertahankan logo sebelumnya jika tidak diubah.
    const logo = logoRemoved
        ? null
        : selectedLogo ?? existingSponsor?.logo ?? null;

    const logoNama = logoRemoved
        ? ""
        : selectedLogoName || existingSponsor?.logoNama || "";

    const dataSponsor = {
        id: existingSponsor ? existingSponsor.id : nextId++,
        nama,
        tier,
        logo,
        logoNama,
        url,
        urutan,
        aktif: sponsorActive.checked,
        penempatan
    };

    if (existingSponsor) {
        sponsors = sponsors.map(item =>
            item.id === existingSponsor.id ? dataSponsor : item
        );

        showToast("Perubahan sponsor berhasil disimpan di demo.");
    } else {
        sponsors.push(dataSponsor);
        showToast("Sponsor berhasil ditambahkan ke demo.");
    }

    closeForm();
    renderAll();
});

// ==========================================
// 5. RENDER TABEL
// ==========================================

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function getTierClass(tier) {
    return {
        "Platinum": "tier-platinum",
        "Gold": "tier-gold",
        "Silver": "tier-silver",
        "Media Partner": "tier-media-partner"
    }[tier] || "";
}

function renderTable() {
    const keyword = searchInput.value.trim().toLowerCase();
    const tier = tierFilter.value;
    const status = statusFilter.value;

    const filteredSponsors = sponsors
        .filter(sponsor => {
            const matchesSearch = sponsor.nama.toLowerCase().includes(keyword);
            const matchesTier = !tier || sponsor.tier === tier;
            const matchesStatus =
                !status ||
                (status === "active" && sponsor.aktif) ||
                (status === "inactive" && !sponsor.aktif);

            return matchesSearch && matchesTier && matchesStatus;
        })
        .sort((a, b) => a.urutan - b.urutan || a.id - b.id);

    tableBody.innerHTML = filteredSponsors.map(sponsor => {
        const logoHTML = sponsor.logo
            ? `<img src="${sponsor.logo}" alt="Logo ${escapeHTML(sponsor.nama)}">`
            : `<span class="logo-placeholder" aria-hidden="true">✦</span>`;

        const placements = sponsor.penempatan
            .map(value => ({
                home: "Utama",
                campuses: "Kampus",
                booths: "Booth"
            }[value] || value))
            .map(escapeHTML)
            .join(", ");

        return `
            <tr>
                <td>
                    <div class="sponsor-identity">
                        ${logoHTML}
                        <div>
                            <strong>${escapeHTML(sponsor.nama)}</strong>
                            <small>${escapeHTML(sponsor.url || "Tidak ada URL")}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="tier-badge ${getTierClass(sponsor.tier)}">
                        ${escapeHTML(sponsor.tier)}
                    </span>
                </td>
                <td>${placements}</td>
                <td>${sponsor.urutan}</td>
                <td>
                    <span class="status-badge ${
                        sponsor.aktif ? "status-active" : "status-inactive"
                    }">
                        ${sponsor.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                </td>
                <td>
                    <div class="action-group">
                        <button
                            type="button"
                            class="action-button"
                            data-action="edit"
                            data-id="${sponsor.id}"
                            aria-label="Edit ${escapeHTML(sponsor.nama)}"
                            title="Edit"
                        >✎</button>

                        <button
                            type="button"
                            class="action-button"
                            data-action="toggle"
                            data-id="${sponsor.id}"
                            aria-label="${sponsor.aktif ? "Nonaktifkan" : "Aktifkan"} ${escapeHTML(sponsor.nama)}"
                            title="${sponsor.aktif ? "Nonaktifkan" : "Aktifkan"}"
                        >${sponsor.aktif ? "◉" : "○"}</button>

                        <button
                            type="button"
                            class="action-button delete"
                            data-action="delete"
                            data-id="${sponsor.id}"
                            aria-label="Hapus ${escapeHTML(sponsor.nama)}"
                            title="Hapus"
                        >⌫</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    emptyState.hidden = filteredSponsors.length !== 0;
}

// ==========================================
// 6. AKSI EDIT, AKTIF/NONAKTIF, HAPUS
// ==========================================

tableBody.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const sponsor = sponsors.find(item => item.id === id);

    if (!sponsor) return;

    if (action === "edit") {
        openForm(sponsor);
        return;
    }

    if (action === "toggle") {
        sponsor.aktif = !sponsor.aktif;

        showToast(
            sponsor.aktif
                ? "Sponsor diaktifkan dalam demo."
                : "Sponsor dinonaktifkan dalam demo."
        );

        renderAll();
        return;
    }

    if (action === "delete") {
        const confirmed = window.confirm(
            `Hapus sponsor "${sponsor.nama}" dari data demo?`
        );

        if (!confirmed) return;

        sponsors = sponsors.filter(item => item.id !== id);

        showToast("Sponsor dihapus dari data demo.");
        renderAll();
    }
});

// ==========================================
// 7. RENDER PREVIEW PUBLIK
// ==========================================

function renderPreview() {
    const slotEnabled = document.getElementById("slotToggle").checked;

    if (!slotEnabled) {
        sponsorPreview.innerHTML = `
            <p class="preview-empty">
                Slot sponsor dinonaktifkan dalam demo ini.
            </p>
        `;
        return;
    }

    const activeSponsors = sponsors
        .filter(sponsor => sponsor.aktif)
        .sort((a, b) => a.urutan - b.urutan || a.id - b.id);

    if (activeSponsors.length === 0) {
        sponsorPreview.innerHTML = `
            <p class="preview-empty">
                Belum ada sponsor aktif untuk ditampilkan.
            </p>
        `;
        return;
    }

    const tiers = ["Platinum", "Gold", "Silver", "Media Partner"];

    sponsorPreview.innerHTML = tiers.map(tier => {
        const tierSponsors = activeSponsors.filter(
            sponsor => sponsor.tier === tier
        );

        if (tierSponsors.length === 0) return "";

        const cards = tierSponsors.map(sponsor => {
            const logo = sponsor.logo
                ? `<img src="${sponsor.logo}" alt="Logo ${escapeHTML(sponsor.nama)}" loading="lazy">`
                : `<span class="preview-logo-placeholder" aria-hidden="true">✦</span>`;

            const content = `
                ${logo}
                <strong>${escapeHTML(sponsor.nama)}</strong>
            `;

            // Hanya gunakan tautan jika URL disediakan.
            return sponsor.url
                ? `<a class="preview-card"
                      href="${escapeHTML(sponsor.url)}"
                      target="_blank"
                      rel="noopener noreferrer">${content}</a>`
                : `<div class="preview-card">${content}</div>`;
        }).join("");

        return `
            <section class="preview-tier">
                <h3>${escapeHTML(tier)}</h3>
                <div class="preview-cards">${cards}</div>
            </section>
        `;
    }).join("");
}

// ==========================================
// 8. RINGKASAN
// ==========================================

function renderSummary() {
    document.getElementById("totalSponsors").textContent = sponsors.length;

    document.getElementById("activeSponsors").textContent =
        sponsors.filter(sponsor => sponsor.aktif).length;

    document.getElementById("tierCount").textContent =
        new Set(sponsors.map(sponsor => sponsor.tier)).size;
}

function renderAll() {
    renderSummary();
    renderTable();
    renderPreview();
}

// ==========================================
// 9. PENGATURAN SLOT DEMO
// ==========================================

const slotToggle = document.getElementById("slotToggle");
const slotNotice = document.getElementById("slotNotice");

function updateSlotNotice() {
    slotNotice.innerHTML = slotToggle.checked
        ? `
            <span class="notice-icon">i</span>
            <div>
                <strong>Slot demo aktif</strong>
                <p>
                    Preview sponsor aktif ditampilkan di bawah.
                    Ini belum mengubah pengaturan slot pada server produksi.
                </p>
            </div>
        `
        : `
            <span class="notice-icon">!</span>
            <div>
                <strong>Slot demo nonaktif</strong>
                <p>
                    Preview sponsor disembunyikan dalam demo ini.
                    Status produksi tetap ditentukan oleh konfigurasi backend.
                </p>
            </div>
        `;
}

slotToggle.addEventListener("change", () => {
    updateSlotNotice();
    renderPreview();
});

// ==========================================
// 10. EVENT LISTENERS
// ==========================================

document.getElementById("addSponsorBtn").addEventListener("click", () => {
    openForm();
});

document.getElementById("closeFormBtn").addEventListener("click", closeForm);
document.getElementById("cancelBtn").addEventListener("click", closeForm);

searchInput.addEventListener("input", renderTable);
tierFilter.addEventListener("change", renderTable);
statusFilter.addEventListener("change", renderTable);

// Navigasi mobile
const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");

menuToggle.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Tutup navigasi" : "Buka navigasi"
    );
});

document.addEventListener("click", event => {
    if (
        window.innerWidth <= 760 &&
        sidebar.classList.contains("is-open") &&
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
    ) {
        sidebar.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Buka navigasi");
    }
});

// ==========================================
// 11. INISIALISASI
// ==========================================

updateSlotNotice();
renderAll();