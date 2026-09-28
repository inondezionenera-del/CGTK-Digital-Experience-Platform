/* =========================================================
   DATA KAMPUS
   ---------------------------------------------------------
   DATA INI MASIH DUMMY.
   Nanti akan diganti dengan data dari API backend.
========================================================= */

const campuses = [

    {
        id: 1,
        nama: "Institut Teknologi Sepuluh Nopember",
        singkatan: "ITS",
        logo: "assets/logos/its.png",
        kota: "Surabaya",
        provinsi: "Jawa Timur",
        jenis: "Negeri",
        rumpun: "Teknik",
        akreditasi: "Unggul",
        website: "https://www.its.ac.id",
        alumni: 12,

        booth: {
            ada: true,
            nama: "Booth ITS",
            lokasi: "Aula A-12",
            acara: "Expo Kampus",
            status: "BUKA"
        },

        alumniList: [
            {
                nama: "Rizal Alfarras Sabibi",
                jurusan: "Teknik Elektro",
                tahun: "2027",
                pesan: "Tanya saya soal SNBT Saintek"
            }
        ],

        jurusan: [
            "Teknik Informatika",
            "Teknik Elektro",
            "Teknik Mesin",
            "Teknik Industri"
        ],

        materi: [
            {
                nama: "Brosur ITS 2027",
                tipe: "FILE",
                url: "#"
            },
            {
                nama: "Halaman Pendaftaran",
                tipe: "LINK",
                url: "https://www.its.ac.id"
            }
        ]
    },


    {
        id: 2,
        nama: "Institut Teknologi Bandung",
        singkatan: "ITB",
        kota: "Bandung",
        provinsi: "Jawa Barat",
        jenis: "Negeri",
        rumpun: "Teknik",
        akreditasi: "Unggul",
        website: "https://itb.ac.id",
        alumni: 8,

        booth: {
            ada: true,
            nama: "Booth ITB",
            lokasi: "Aula A-12",
            acara: "Expo Kampus",
            status: "BUKA"
        },

        alumniList: [
            {
                nama: "Dimas",
                jurusan: "Teknik Informatika",
                tahun: "2023",
                pesan: "Senang berbagi pengalaman kuliah di ITB."
            }
        ],

        jurusan: [
            "Teknik Informatika",
            "Teknik Elektro",
            "Teknik Sipil"
        ],

        materi: [
            {
                nama: "Brosur ITB 2027",
                tipe: "FILE",
                url: "#"
            },
            {
                nama: "Website ITB",
                tipe: "LINK",
                url: "https://itb.ac.id"
            }
        ]
    },


    {
        id: 3,
        nama: "Universitas Gadjah Mada",
        singkatan: "UGM",
        kota: "Yogyakarta",
        provinsi: "Daerah Istimewa Yogyakarta",
        jenis: "Negeri",
        rumpun: "Sains",
        akreditasi: "Unggul",
        website: "https://ugm.ac.id",
        alumni: 15,

        booth: {
            ada: true,
            nama: "Booth UGM",
            lokasi: "Aula B-04",
            acara: "Expo Kampus",
            status: "TUTUP"
        },

        alumniList: [
            {
                nama: "Raka",
                jurusan: "Teknik Elektro",
                tahun: "2024",
                pesan: "Yuk kenalan dengan UGM!"
            }
        ],

        jurusan: [
            "Matematika",
            "Fisika",
            "Teknik Elektro",
            "Ilmu Komputer"
        ],

        materi: [
            {
                nama: "Brosur UGM",
                tipe: "FILE",
                url: "#"
            }
        ]
    },


    {
        id: 4,
        nama: "Universitas Ciputra",
        singkatan: "UC",
        kota: "Surabaya",
        provinsi: "Jawa Timur",
        jenis: "Swasta",
        rumpun: "Bisnis",
        akreditasi: "Unggul",
        website: "https://www.ciputra.ac.id",
        alumni: 6,

        booth: {
            ada: true,
            nama: "Booth UC",
            lokasi: "Aula B-10",
            acara: "Expo Kampus",
            status: "BUKA"
        },

        alumniList: [],

        jurusan: [
            "Manajemen",
            "Akuntansi",
            "Bisnis Internasional"
        ],

        materi: [
            {
                nama: "Informasi Universitas Ciputra",
                tipe: "LINK",
                url: "https://www.ciputra.ac.id"
            }
        ]
    },


    {
        id: 5,
        nama: "Universitas Muhammadiyah Malang",
        singkatan: "UMM",
        kota: "Malang",
        provinsi: "Jawa Timur",
        jenis: "Swasta",
        rumpun: "Sosial",
        akreditasi: "Unggul",
        website: "https://www.umm.ac.id",
        alumni: 10,

        booth: {
            ada: true,
            nama: "Booth UMM",
            lokasi: "Aula C-02",
            acara: "Expo Kampus",
            status: "BUKA"
        },

        alumniList: [],

        jurusan: [
            "Ilmu Komunikasi",
            "Hubungan Internasional",
            "Manajemen"
        ],

        materi: []
    }

];


/* =========================================================
   STATE
========================================================= */

let activeJenis = "semua";
let activeRumpun = "semua";


/* =========================================================
   ELEMENT
========================================================= */

const campusList = document.getElementById("campusList");

const searchInput = document.getElementById("searchInput");

const clearSearch = document.getElementById("clearSearch");

const rumpunButton = document.getElementById("rumpunButton");

const rumpunMenu = document.getElementById("rumpunMenu");

const rumpunWrapper = document.querySelector(".rumpun-wrapper");

const rumpunText = document.getElementById("rumpunText");

const detailOverlay = document.getElementById("detailOverlay");

const detailContent = document.getElementById("detailContent");

const detailClose = document.getElementById("detailClose");


/* =========================================================
   TAMPILKAN KAMPUS
========================================================= */

function tampilkanKampus(data) {

    if (!campusList) {
        return;
    }

    campusList.innerHTML = "";


    /* =====================================================
       EMPTY STATE
    ===================================================== */

    if (data.length === 0) {

        campusList.innerHTML = `
            <div class="empty-state">

                <div class="empty-state-icon">
                    🔎
                </div>

                <h3>
                    Kampus tidak ditemukan
                </h3>

                <p>
                    Coba gunakan kata kunci atau filter lain.
                </p>

            </div>
        `;

        return;
    }


    /* =====================================================
       CARD KAMPUS
    ===================================================== */

    data.forEach(campus => {

        const card =
            document.createElement("article");

        card.className = "campus-card";

        card.innerHTML = `

            <div class="card-top">

                <div class="campus-icon">
                    🏫
                </div>

                <span class="campus-type">
                    ${campus.jenis}
                </span>

            </div>


            <h2>
                ${campus.nama}
            </h2>


            <p class="campus-city">
                📍 ${campus.kota}
            </p>


            <p class="campus-rumpun">
                🌿 Rumpun ${campus.rumpun}
            </p>


            <span class="campus-alumni">
                👥 ${campus.alumni} alumni hadir
            </span>


            <button
                type="button"
                class="campus-button"
                data-id="${campus.id}"
            >
                Lihat Detail
            </button>

        `;

        campusList.appendChild(card);

    });

}


/* =========================================================
   FILTER KAMPUS
========================================================= */

function filterKampus() {

    const keyword =
        searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";


    const hasil = campuses.filter(campus => {


        /* =================================================
           SEARCH
        ================================================= */

        const cocokSearch =

            campus.nama
                .toLowerCase()
                .includes(keyword)

            ||

            campus.singkatan
                .toLowerCase()
                .includes(keyword)

            ||

            campus.kota
                .toLowerCase()
                .includes(keyword);


        /* =================================================
           FILTER JENIS
        ================================================= */

        const cocokJenis =

            activeJenis === "semua"

            ||

            campus.jenis
                .toLowerCase() === activeJenis;


        /* =================================================
           FILTER RUMPUN
        ================================================= */

        const cocokRumpun =

            activeRumpun === "semua"

            ||

            campus.rumpun
                .toLowerCase() === activeRumpun;


        return (
            cocokSearch &&
            cocokJenis &&
            cocokRumpun
        );

    });


    tampilkanKampus(hasil);

}


/* =========================================================
   FILTER JENIS
========================================================= */

const filterButtons =
    document.querySelectorAll(
        ".filter[data-type]"
    );


filterButtons.forEach(button => {

    button.addEventListener(
        "click",
        function () {

            activeJenis =
                button.dataset.type.toLowerCase();


            /* Hapus active dari semua */

            filterButtons.forEach(item => {

                item.classList.remove("active");

            });


            /* Tambahkan active */

            button.classList.add("active");


            filterKampus();

        }
    );

});


/* =========================================================
   RUMPUN DROPDOWN
========================================================= */

if (
    rumpunButton &&
    rumpunMenu &&
    rumpunWrapper
) {

    /* =====================================================
       BUKA / TUTUP DROPDOWN
    ===================================================== */

    rumpunButton.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            const sedangTerbuka =
                rumpunMenu.classList.contains("show");


            if (sedangTerbuka) {

                tutupRumpun();

            } else {

                bukaRumpun();

            }

        }
    );


    /* =====================================================
       PILIH RUMPUN
    ===================================================== */

    const rumpunOptions =
        rumpunMenu.querySelectorAll(
            "[data-rumpun]"
        );


    rumpunOptions.forEach(option => {

        option.addEventListener(
            "click",
            function (event) {

                event.stopPropagation();


                /*
                   Ambil nilai dari data-rumpun.
                   Contoh:
                   data-rumpun="teknik"
                */

                activeRumpun =
                    option.dataset.rumpun
                        .toLowerCase();


                /* ================================
                   ACTIVE ITEM
                ================================= */

                rumpunOptions.forEach(item => {

                    item.classList.remove(
                        "active"
                    );

                });


                option.classList.add("active");


                /* ================================
                   UBAH TEKS TOMBOL
                ================================= */

                if (
                    activeRumpun === "semua"
                ) {

                    rumpunText.textContent =
                        "Rumpun";

                } else {

                    rumpunText.textContent =
                        option.textContent.trim();

                }


                /* ================================
                   TUTUP DROPDOWN
                ================================= */

                tutupRumpun();


                /* ================================
                   FILTER
                ================================= */

                filterKampus();

            }
        );

    });

}


/* =========================================================
   BUKA RUMPUN
========================================================= */

function bukaRumpun() {

    if (!rumpunMenu || !rumpunWrapper) {
        return;
    }

    rumpunMenu.classList.add("show");

    rumpunWrapper.classList.add("open");


    if (rumpunButton) {

        rumpunButton.setAttribute(
            "aria-expanded",
            "true"
        );

    }

}


/* =========================================================
   TUTUP RUMPUN
========================================================= */

function tutupRumpun() {

    if (!rumpunMenu || !rumpunWrapper) {
        return;
    }

    rumpunMenu.classList.remove("show");

    rumpunWrapper.classList.remove("open");


    if (rumpunButton) {

        rumpunButton.setAttribute(
            "aria-expanded",
            "false"
        );

    }

}


/* =========================================================
   KLIK DI LUAR DROPDOWN
========================================================= */

document.addEventListener(
    "click",
    function (event) {

        if (
            rumpunWrapper &&
            !rumpunWrapper.contains(event.target)
        ) {

            tutupRumpun();

        }

    }
);


/* =========================================================
   ESC
========================================================= */

document.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Escape") {

            tutupRumpun();

            tutupDetail();

        }

    }
);


/* =========================================================
   SEARCH
========================================================= */

if (searchInput) {

    searchInput.addEventListener(
        "input",
        function () {

            if (clearSearch) {

                if (
                    searchInput.value.trim() !== ""
                ) {

                    clearSearch.classList.add(
                        "show"
                    );

                } else {

                    clearSearch.classList.remove(
                        "show"
                    );

                }

            }


            filterKampus();

        }
    );

}


/* =========================================================
   CLEAR SEARCH
========================================================= */

if (clearSearch) {

    clearSearch.addEventListener(
        "click",
        function () {

            if (!searchInput) {
                return;
            }

            searchInput.value = "";

            clearSearch.classList.remove(
                "show"
            );


            filterKampus();

            searchInput.focus();

        }
    );

}


/* =========================================================
   DETAIL CAMPUS
========================================================= */

if (campusList) {

    campusList.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    ".campus-button"
                );


            if (!button) {
                return;
            }


            const id =
                Number(button.dataset.id);


            const campus =
                campuses.find(
                    item => item.id === id
                );


            if (!campus) {
                return;
            }


            bukaDetail(campus);

        }
    );

}


/* =========================================================
   BUKA DETAIL
========================================================= */

function bukaDetail(campus) {

    if (
        !detailOverlay ||
        !detailContent
    ) {
        return;
    }


    detailContent.innerHTML =
        buatDetailHTML(campus);


    detailOverlay.classList.add("show");


    detailOverlay.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.style.overflow =
        "hidden";

}


/* =========================================================
   DETAIL HTML
========================================================= */

function buatDetailHTML(campus) {

    return `

        <div class="detail-hero">

            <div class="detail-hero-top">

                <div class="detail-logo">
    <img
        src="${campus.logo}"
        alt="Logo ${campus.singkatan}"
        loading="lazy"
    >
        </div>

                <div>

                    <span class="detail-badge">
                        ${campus.jenis}
                    </span>

                    <h2
                        class="detail-title"
                        id="detailTitle"
                    >
                        ${campus.nama}
                    </h2>

                    <p class="detail-singkatan">
                        ${campus.singkatan}
                    </p>

                    <p class="detail-location">
                        📍 ${campus.kota},
                        ${campus.provinsi}
                    </p>

                </div>

            </div>


            <div class="detail-stats">

                <div class="detail-stat">

                    <strong>
                        ${campus.singkatan}
                    </strong>

                    <span>
                        Singkatan
                    </span>

                </div>


                <div class="detail-stat">

                    <strong>
                        ${campus.akreditasi}
                    </strong>

                    <span>
                        Akreditasi
                    </span>

                </div>


                <div class="detail-stat">

                    <strong>
                        ${campus.alumni}
                    </strong>

                    <span>
                        Alumni
                    </span>

                </div>

            </div>


            <a
                class="website-button"
                href="${campus.website}"
                target="_blank"
                rel="noopener noreferrer"
            >
                🌐 Kunjungi Website
            </a>

        </div>


        <div class="detail-body">


            <!-- INFORMASI -->

            <section class="detail-section">

                <h3 class="detail-section-title">

                    <span>ⓘ</span>

                    Informasi Kampus

                </h3>


                <div class="info-grid">

                    <div class="info-row">

                        <span class="info-label">
                            Nama
                        </span>

                        <span class="info-value">
                            ${campus.nama}
                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">
                            Singkatan
                        </span>

                        <span class="info-value">
                            ${campus.singkatan}
                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">
                            Jenis
                        </span>

                        <span class="info-value">
                            ${campus.jenis}
                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">
                            Rumpun
                        </span>

                        <span class="info-value">
                            ${campus.rumpun}
                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">
                            Kota
                        </span>

                        <span class="info-value">
                            ${campus.kota}
                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">
                            Akreditasi
                        </span>

                        <span class="info-value">
                            ${campus.akreditasi}
                        </span>

                    </div>

                </div>

            </section>


            <!-- BOOTH -->

            <section class="detail-section">

                <h3 class="detail-section-title">

                    <span>🏪</span>

                    Booth di CGTK

                </h3>

                ${buatBoothHTML(campus)}

            </section>


            <!-- ALUMNI -->

            <section class="detail-section">

                <h3 class="detail-section-title">

                    <span>👥</span>

                    Alumni yang Hadir

                </h3>

                ${buatAlumniHTML(campus)}

            </section>


            <!-- JURUSAN -->

            <section class="detail-section">

                <h3 class="detail-section-title">

                    <span>🎓</span>

                    Jurusan

                </h3>

                ${buatJurusanHTML(campus)}

            </section>


            <!-- MATERI -->

            <section class="detail-section">

                <h3 class="detail-section-title">

                    <span>📚</span>

                    Materi

                </h3>

                ${buatMateriHTML(campus)}

            </section>


        </div>

    `;

}


/* =========================================================
   BOOTH
========================================================= */

function buatBoothHTML(campus) {

    if (
        !campus.booth ||
        !campus.booth.ada
    ) {

        return `

            <div class="empty-state">

                <h3>
                    Booth belum tersedia
                </h3>

                <p>
                    Informasi booth belum tersedia.
                </p>

            </div>

        `;

    }


    return `

        <div class="booth-card">

            <div class="booth-name">
                ${campus.booth.nama}
            </div>

            <div class="booth-detail">

                📍 ${campus.booth.lokasi}

                <br>

                🎪 ${campus.booth.acara}

            </div>

            <span class="booth-status">

                ● ${campus.booth.status}

            </span>

        </div>

    `;

}


/* =========================================================
   ALUMNI
========================================================= */

function buatAlumniHTML(campus) {

    if (
        !campus.alumniList ||
        campus.alumniList.length === 0
    ) {

        return `

            <div class="empty-state">

                <h3>
                    Belum ada data alumni
                </h3>

                <p>
                    Informasi alumni belum tersedia.
                </p>

            </div>

        `;

    }


    return `

        <div class="alumni-list">

            ${campus.alumniList.map(
                alumni => `

                    <div class="alumni-item">

                        <div class="alumni-photo">
                            👤
                        </div>

                        <div class="alumni-info">

                            <strong>
                                ${alumni.nama}
                            </strong>

                            <span>
                                ${alumni.jurusan}
                                • ${alumni.tahun}
                            </span>

                            <span class="alumni-message">
                                "${alumni.pesan}"
                            </span>

                        </div>

                    </div>

                `
            ).join("")}

        </div>

    `;

}


/* =========================================================
   JURUSAN
========================================================= */

function buatJurusanHTML(campus) {

    if (
        !campus.jurusan ||
        campus.jurusan.length === 0
    ) {

        return `

            <p class="detail-location">
                Data jurusan belum tersedia.
            </p>

        `;

    }


    return `

        <div class="major-list">

            ${campus.jurusan.map(
                jurusan => `

                    <span class="major-item">
                        ${jurusan}
                    </span>

                `
            ).join("")}

        </div>

    `;

}


/* =========================================================
   MATERI
========================================================= */

function buatMateriHTML(campus) {

    if (
        !campus.materi ||
        campus.materi.length === 0
    ) {

        return `

            <div class="empty-state">

                <h3>
                    Materi belum tersedia
                </h3>

                <p>
                    Belum ada materi yang dapat ditampilkan.
                </p>

            </div>

        `;

    }


    return `

        <div class="material-list">

            ${campus.materi.map(
                materi => `

                    <a
                        class="material-item"
                        href="${materi.url}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >

                        <span class="material-icon">

                            ${
                                materi.tipe === "FILE"
                                    ? "📄"
                                    : "🔗"
                            }

                        </span>

                        <span>
                            ${materi.nama}
                        </span>

                    </a>

                `
            ).join("")}

        </div>

    `;

}


/* =========================================================
   TUTUP DETAIL
========================================================= */

function tutupDetail() {

    if (!detailOverlay) {
        return;
    }


    detailOverlay.classList.remove("show");


    detailOverlay.setAttribute(
        "aria-hidden",
        "true"
    );


    document.body.style.overflow = "";

}


/* =========================================================
   CLOSE DETAIL BUTTON
========================================================= */

if (detailClose) {

    detailClose.addEventListener(
        "click",
        tutupDetail
    );

}


/* =========================================================
   CLICK BACKDROP
========================================================= */

if (detailOverlay) {

    detailOverlay.addEventListener(
        "click",
        function (event) {

            if (
                event.target === detailOverlay
            ) {

                tutupDetail();

            }

        }
    );

}


/* =========================================================
   INITIAL
========================================================= */

tampilkanKampus(campuses);