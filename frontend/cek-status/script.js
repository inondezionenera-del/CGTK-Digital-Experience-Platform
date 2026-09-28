/* =========================================================
   ELEMENT
========================================================= */

const statusForm =
    document.getElementById("statusForm");

const registrationCode =
    document.getElementById("registrationCode");

const checkButton =
    document.getElementById("checkButton");

const errorMessage =
    document.getElementById("errorMessage");

const result =
    document.getElementById("result");

const statusIcon =
    document.getElementById("statusIcon");

const statusTitle =
    document.getElementById("statusTitle");

const statusMessage =
    document.getElementById("statusMessage");

const participantName =
    document.getElementById("participantName");


/* =========================================================
   DUMMY DATA
   ---------------------------------------------------------
   SEMENTARA SAJA.
   Nanti diganti dengan API backend.
========================================================= */

const dummyRegistrations = {

    "CGTK-001": {
        nama_singkat: "Rizal.",
        status: "BELUM_BAYAR"
    },

    "CGTK-002": {
        nama_singkat: "Rina A.",
        status: "MENUNGGU_VERIFIKASI"
    },

    "CGTK-003": {
        nama_singkat: "Dimas P.",
        status: "LUNAS"
    },

    "CGTK-004": {
        nama_singkat: "Andi R.",
        status: "DIBATALKAN",
        alasan: "Data pembayaran tidak sesuai."
    }

};


/* =========================================================
   INFORMASI STATUS
========================================================= */

const statusConfig = {

    BELUM_BAYAR: {

        icon: "⏳",

        title:
            "Belum Bayar",

        message:
            "Pendaftaran tercatat, pembayaran belum diterima."

    },


    MENUNGGU_VERIFIKASI: {

        icon: "🔍",

        title:
            "Menunggu Verifikasi",

        message:
            "Bukti pembayaranmu sedang diperiksa panitia."

    },


    LUNAS: {

        icon: "✅",

        title:
            "Lunas",

        message:
            "Pembayaran lunas. Silakan login untuk melihat QR."

    },


    DIBATALKAN: {

        icon: "❌",

        title:
            "Dibatalkan",

        message:
            "Pendaftaran dibatalkan."

    }

};


/* =========================================================
   SUBMIT FORM
========================================================= */

statusForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        const code =
            registrationCode.value
                .trim()
                .toUpperCase();


        /* Bersihkan tampilan sebelumnya */

        sembunyikanError();

        sembunyikanHasil();


        /* Validasi */

        if (!code) {

            tampilkanError(
                "Kode registrasi wajib diisi."
            );

            return;
        }


        /* Loading */

        setLoading(true);


        try {

            /*
                SEMENTARA menggunakan
                dummy data.

                Nanti bagian ini diganti
                dengan request API.
            */

            const data =
                await cekStatusDummy(code);


            tampilkanHasil(data);

        }

        catch (error) {

            tampilkanError(
                error.message
            );

        }

        finally {

            setLoading(false);

        }

    }
);


/* =========================================================
   DUMMY API
========================================================= */

function cekStatusDummy(code) {

    return new Promise(
        function (resolve, reject) {

            setTimeout(
                function () {

                    const data =
                        dummyRegistrations[code];


                    if (!data) {

                        reject(
                            new Error(
                                "Kode registrasi tidak ditemukan."
                            )
                        );

                        return;
                    }


                    resolve(data);

                },

                500
            );

        }
    );

}


/* =========================================================
   TAMPILKAN HASIL
========================================================= */

function tampilkanHasil(data) {

    const config =
        statusConfig[data.status];


    if (!config) {

        tampilkanError(
            "Status pendaftaran tidak dikenali."
        );

        return;
    }


    statusIcon.textContent =
        config.icon;


    statusTitle.textContent =
        config.title;


    let message =
        config.message;


    /*
       Khusus DIBATALKAN,
       tambahkan alasan dari backend.
    */

    if (
        data.status === "DIBATALKAN" &&
        data.alasan
    ) {

        message +=
            ` Alasan: ${data.alasan}`;

    }


    statusMessage.textContent =
        message;


    participantName.textContent =
        data.nama_singkat || "";


    result.hidden = false;

}


/* =========================================================
   ERROR
========================================================= */

function tampilkanError(message) {

    errorMessage.textContent =
        message;

    errorMessage.hidden = false;

}


function sembunyikanError() {

    errorMessage.hidden = true;

    errorMessage.textContent = "";

}


/* =========================================================
   HIDE RESULT
========================================================= */

function sembunyikanHasil() {

    result.hidden = true;

}


/* =========================================================
   LOADING
========================================================= */

function setLoading(isLoading) {

    checkButton.disabled =
        isLoading;


    if (isLoading) {

        checkButton.textContent =
            "Memeriksa...";

    } else {

        checkButton.textContent =
            "Cek Status";

    }

}