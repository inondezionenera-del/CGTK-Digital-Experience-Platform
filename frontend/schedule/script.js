
const IKON_LOKASI =
    '<svg viewBox="0 0 43 43" aria-hidden="true"><path d="M16.1 39.4V21.5h10.8v17.9M5.4 16.1 21.5 3.6l16.1 12.5v19.7a3.6 3.6 0 0 1-3.6 3.6H9a3.6 3.6 0 0 1-3.6-3.6z"/></svg>';

const IKON_JAM =
    '<svg class="tl-clock" viewBox="0 0 43 43" aria-hidden="true"><circle cx="21.5" cy="21.5" r="18"/><path d="M21.5 11v10.5l7 3.5"/></svg>';


// ==========================================
// STATUS -> TAMPILAN
// ACTIVE = berlangsung, CLOSED = selesai,
// status lain (selain DRAFT) = belum dimulai
// ==========================================

function infoStatus(status) {

    const nilai = String(status || "").toUpperCase();

    if (nilai === "ACTIVE") {
        return { label: "Sesi berlangsung", css: "is-live", bisaScan: true };
    }

    if (nilai === "CLOSED") {
        return { label: "Sesi selesai", css: "is-done", bisaScan: false };
    }

    return { label: "Sesi belum dimulai", css: "is-waiting", bisaScan: false };
}


// ==========================================
// KELOMPOKKAN SESI PER EVENT
// Satu kartu = satu event, isinya satu atau lebih sesi.
// Urutan kartu mengikuti jam mulai paling awal.
// ==========================================

function kelompokkanPerEvent(daftarSesi) {

    const peta = new Map();

    daftarSesi.forEach(session => {

        const kunci =
            session.event_id ??
            session.events?.id ??
            session.events?.nama ??
            "acara";

        if (!peta.has(kunci)) {
            peta.set(kunci, []);
        }

        peta.get(kunci).push(session);
    });

    return [...peta.values()];
}


// ==========================================
// KARTU EVENT
// ==========================================

function buatEventHTML(kelompok) {

    const event = kelompok[0].events || {};

    const tanggal = event.tanggal
        ? formatTanggal(event.tanggal)
        : "";

    return `
        <article class="tl-card">

            <div class="tl-card-head">
                <h2 class="tl-card-title">
                    ${escapeHTML(event.nama || "Acara")}
                </h2>
                <span class="tl-card-date">
                    ${escapeHTML(tanggal)}
                </span>
            </div>

            ${kelompok.map(buatSessionHTML).join("")}

        </article>
    `;
}


// ==========================================
// BARIS SESI
// ==========================================

function buatSessionHTML(session) {

    const status = infoStatus(session.status);

    const namaEvent = session.events?.nama || "";

    // Nama sesi hanya ditampilkan kalau berbeda dari nama event
    const namaSesiHTML =
        session.nama && session.nama !== namaEvent
            ? `<p class="tl-session-name">${escapeHTML(session.nama)}</p>`
            : "";

    const waktu = formatWaktu(
        session.jam_mulai,
        session.jam_selesai
    );

    let aksiHTML;

    if (session.saya_sudah_hadir === true) {

        aksiHTML = `
            <span class="tl-scan is-hadir">✓ Sudah hadir</span>
        `;

    } else if (status.bisaScan) {

        // Sesuaikan alamat scanner dan nama field id jika berbeda
        aksiHTML = `
            <a
                class="tl-scan"
                href="scanner.html?session=${encodeURIComponent(session.id)}"
            >SCAN</a>
        `;

    } else {

        aksiHTML = `
            <span class="tl-scan" role="link" aria-disabled="true">SCAN</span>
        `;
    }

    return `
        <div class="tl-session">

            ${namaSesiHTML}

            <ul class="tl-info">
                <li>
                    ${IKON_LOKASI}
                    <span>${escapeHTML(session.lokasi || "-")}</span>
                </li>
                <li>
                    ${IKON_JAM}
                    <span class="tl-time">${escapeHTML(waktu)}</span>
                </li>
                <li class="tl-status ${status.css}">
                    ${status.label}
                </li>
            </ul>

            ${aksiHTML}

        </div>
    `;
}