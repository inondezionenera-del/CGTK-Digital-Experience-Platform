/* =========================================================
   DATA DUMMY
   ---------------------------------------------------------
   Sementara digunakan untuk menguji logic frontend.
   Nanti diganti dengan API backend.
========================================================= */

let events = [

    {
        id: 1,

        nama: "Pembukaan",

        tipe: "PEMBUKAAN",

        tanggal: "2027-01-15",

        deskripsi: "Pembukaan CGTK 2027",

        urutan: 1
    },

    {
        id: 2,

        nama: "Expo Kampus",

        tipe: "EXPO_KAMPUS",

        tanggal: "2027-01-15",

        deskripsi: "Expo kampus peserta CGTK 2027",

        urutan: 2
    },

    {
        id: 3,

        nama: "Expo Jurusan",

        tipe: "EXPO_JURUSAN",

        tanggal: "2027-01-16",

        deskripsi: "Expo jurusan CGTK 2027",

        urutan: 3
    },

    {
        id: 4,

        nama: "Penutupan",

        tipe: "PENUTUPAN",

        tanggal: "2027-01-16",

        deskripsi: "Penutupan CGTK 2027",

        urutan: 4
    }

];


let sessions = [

    {
        id: 1,

        eventId: 1,

        nama: "Registrasi Ulang",

        lokasi: "Lobby Utama",

        jamMulai: "08:00",

        jamSelesai: "08:30",

        xp: 10,

        wajibPresensi: true,

        urutan: 1,

        status: "CLOSED"
    },

    {
        id: 2,

        eventId: 1,

        nama: "Opening Ceremony",

        lokasi: "Aula Utama",

        jamMulai: "09:00",

        jamSelesai: "10:00",

        xp: 20,

        wajibPresensi: true,

        urutan: 2,

        status: "ACTIVE"
    },

    {
        id: 3,

        eventId: 2,

        nama: "Campus Expo",

        lokasi: "Lapangan",

        jamMulai: "10:30",

        jamSelesai: "12:00",

        xp: 30,

        wajibPresensi: false,

        urutan: 1,

        status: "DRAFT"
    }

];


/* =========================================================
   ELEMENT
========================================================= */

const eventList =
    document.getElementById("eventList");

const eventSelect =
    document.getElementById("eventSelect");

const sessionList =
    document.getElementById("sessionList");


/* EVENT MODAL */

const eventModal =
    document.getElementById("eventModal");

const eventForm =
    document.getElementById("eventForm");

const eventModalTitle =
    document.getElementById("eventModalTitle");


/* SESSION MODAL */

const sessionModal =
    document.getElementById("sessionModal");

const sessionForm =
    document.getElementById("sessionForm");

const sessionModalTitle =
    document.getElementById("sessionModalTitle");


/* CONFIRMATION */

const closeSessionConfirm =
    document.getElementById(
        "closeSessionConfirm"
    );


let sessionToClose = null;


/* =========================================================
   HELPER
========================================================= */

function formatTanggal(tanggal) {

    const date =
        new Date(`${tanggal}T00:00:00`);

    return date.toLocaleDateString(
        "id-ID",
        {
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );
}


/* =========================================================
   RENDER EVENT
========================================================= */

function tampilkanEvents() {

    eventList.innerHTML = "";

    const sortedEvents =
        [...events].sort(
            (a, b) =>
                a.urutan - b.urutan
        );


    if (sortedEvents.length === 0) {

        eventList.innerHTML = `
            <div class="empty-state">
                Belum ada acara.
            </div>
        `;

        return;
    }


    sortedEvents.forEach(
        (event, index) => {

            const card =
                document.createElement(
                    "article"
                );

            card.className =
                "event-card";


            card.innerHTML = `

                <div class="event-top">

                    <div class="event-number">
                        ${String(index + 1).padStart(2, "0")}
                    </div>

                    <div class="event-content">

                        <div class="event-name">
                            ${event.nama}
                        </div>

                        <div class="event-meta">
                            ${formatTanggal(event.tanggal)}
                        </div>

                        <span class="event-type">
                            ${event.tipe}
                        </span>

                    </div>

                </div>


                <div class="event-actions">

                    <button
                        type="button"
                        class="small-button"
                        data-action="edit-event"
                        data-id="${event.id}"
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        class="small-button delete"
                        data-action="delete-event"
                        data-id="${event.id}"
                    >
                        Hapus
                    </button>

                </div>

            `;

            eventList.appendChild(card);

        }
    );

}


/* =========================================================
   RENDER EVENT SELECT
========================================================= */

function tampilkanEventSelect() {

    const currentValue =
        eventSelect.value;


    eventSelect.innerHTML = "";


    events
        .sort(
            (a, b) =>
                a.urutan - b.urutan
        )
        .forEach(event => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                event.id;

            option.textContent =
                event.nama;

            eventSelect.appendChild(
                option
            );

        });


    if (
        events.some(
            event =>
                String(event.id) ===
                currentValue
        )
    ) {

        eventSelect.value =
            currentValue;

    }

}


/* =========================================================
   RENDER SESSION
========================================================= */

function tampilkanSessions() {

    sessionList.innerHTML = "";


    const selectedEventId =
        Number(eventSelect.value);


    const filteredSessions =
        sessions
            .filter(
                session =>
                    session.eventId ===
                    selectedEventId
            )
            .sort(
                (a, b) =>
                    a.urutan - b.urutan
            );


    if (
        filteredSessions.length === 0
    ) {

        sessionList.innerHTML = `
            <div class="empty-state">
                Belum ada sesi untuk acara ini.
            </div>
        `;

        return;
    }


    filteredSessions.forEach(
        session => {

            const card =
                document.createElement(
                    "article"
                );

            card.className =
                `session-card ${session.status.toLowerCase()}`;


            card.innerHTML = `

                <div class="session-top">

                    <div>

                        <div class="session-name">
                            ${session.nama}
                        </div>

                        <div class="session-location">
                            📍 ${session.lokasi}
                        </div>

                        <div class="session-time">
                            ${session.jamMulai}
                            —
                            ${session.jamSelesai}
                        </div>

                    </div>

                </div>


                <div class="status-control">

                    <span class="status-label">
                        STATUS SESI
                    </span>

                    <select
                        class="status-select ${session.status.toLowerCase()}"
                        data-action="change-status"
                        data-id="${session.id}"
                    >

                        <option
                            value="DRAFT"
                            ${session.status === "DRAFT" ? "selected" : ""}
                        >
                            ⚪ DRAFT
                        </option>

                        <option
                            value="ACTIVE"
                            ${session.status === "ACTIVE" ? "selected" : ""}
                        >
                            🟢 ACTIVE
                        </option>

                        <option
                            value="CLOSED"
                            ${session.status === "CLOSED" ? "selected" : ""}
                        >
                            ⚫ CLOSED
                        </option>

                    </select>

                </div>


                <div class="session-meta">

                    <span class="meta-badge">
                        ⭐ ${session.xp} XP
                    </span>

                    <span class="meta-badge">
                        ${
                            session.wajibPresensi
                                ? "✓ Wajib Presensi"
                                : "Presensi Tidak Wajib"
                        }
                    </span>

                </div>


                <div class="session-actions">

                    <button
                        type="button"
                        class="small-button"
                        data-action="edit-session"
                        data-id="${session.id}"
                    >
                        Edit Sesi
                    </button>

                </div>

            `;

            sessionList.appendChild(card);

        }
    );

}


/* =========================================================
   EVENT MODAL
========================================================= */

function bukaEventModal(event = null) {

    eventForm.reset();


    if (event) {

        eventModalTitle.textContent =
            "Edit Acara";

        document.getElementById(
            "eventId"
        ).value = event.id;

        document.getElementById(
            "eventName"
        ).value = event.nama;

        document.getElementById(
            "eventType"
        ).value = event.tipe;

        document.getElementById(
            "eventDate"
        ).value = event.tanggal;

        document.getElementById(
            "eventDescription"
        ).value = event.deskripsi;

        document.getElementById(
            "eventOrder"
        ).value = event.urutan;

    } else {

        eventModalTitle.textContent =
            "Tambah Acara";

        document.getElementById(
            "eventId"
        ).value = "";

    }


    eventModal.classList.add("show");

    eventModal.setAttribute(
        "aria-hidden",
        "false"
    );

}


function tutupEventModal() {

    eventModal.classList.remove("show");

    eventModal.setAttribute(
        "aria-hidden",
        "true"
    );

}


/* =========================================================
   SIMPAN EVENT
========================================================= */

eventForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();


        const id =
            Number(
                document.getElementById(
                    "eventId"
                ).value
            );


        const data = {

            nama:
                document.getElementById(
                    "eventName"
                ).value.trim(),

            tipe:
                document.getElementById(
                    "eventType"
                ).value,

            tanggal:
                document.getElementById(
                    "eventDate"
                ).value,

            deskripsi:
                document.getElementById(
                    "eventDescription"
                ).value.trim(),

            urutan:
                Number(
                    document.getElementById(
                        "eventOrder"
                    ).value
                )

        };


        if (id) {

            const eventData =
                events.find(
                    item =>
                        item.id === id
                );

            if (!eventData) {
                return;
            }

            Object.assign(
                eventData,
                data
            );

        } else {

            const newId =
                events.length
                    ? Math.max(
                        ...events.map(
                            item =>
                                item.id
                        )
                    ) + 1
                    : 1;


            events.push({

                id: newId,

                ...data

            });

        }


        tutupEventModal();

        tampilkanEvents();

        tampilkanEventSelect();

        tampilkanSessions();

    }
);


/* =========================================================
   HAPUS EVENT
========================================================= */

function hapusEvent(id) {

    const eventData =
        events.find(
            item =>
                item.id === id
        );


    if (!eventData) {
        return;
    }


    const yakin =
        confirm(
            `Hapus acara "${eventData.nama}"?`
        );


    if (!yakin) {
        return;
    }


    events =
        events.filter(
            item =>
                item.id !== id
        );


    sessions =
        sessions.filter(
            session =>
                session.eventId !== id
        );


    tampilkanEvents();

    tampilkanEventSelect();

    tampilkanSessions();

}


/* =========================================================
   SESSION MODAL
========================================================= */

function bukaSessionModal(session = null) {

    sessionForm.reset();


    tampilkanSessionEventSelect();


    if (session) {

        sessionModalTitle.textContent =
            "Edit Sesi";


        document.getElementById(
            "sessionId"
        ).value = session.id;


        document.getElementById(
            "sessionEvent"
        ).value = session.eventId;


        document.getElementById(
            "sessionName"
        ).value = session.nama;


        document.getElementById(
            "sessionLocation"
        ).value = session.lokasi;


        document.getElementById(
            "sessionStart"
        ).value = session.jamMulai;


        document.getElementById(
            "sessionEnd"
        ).value = session.jamSelesai;


        document.getElementById(
            "sessionXP"
        ).value = session.xp;


        document.getElementById(
            "sessionRequired"
        ).checked =
            session.wajibPresensi;


        document.getElementById(
            "sessionOrder"
        ).value = session.urutan;

    } else {

        sessionModalTitle.textContent =
            "Tambah Sesi";


        document.getElementById(
            "sessionId"
        ).value = "";


        document.getElementById(
            "sessionEvent"
        ).value =
            eventSelect.value || "";

    }


    sessionModal.classList.add(
        "show"
    );

    sessionModal.setAttribute(
        "aria-hidden",
        "false"
    );

}


function tutupSessionModal() {

    sessionModal.classList.remove(
        "show"
    );

    sessionModal.setAttribute(
        "aria-hidden",
        "true"
    );

}


/* =========================================================
   SESSION EVENT SELECT
========================================================= */

function tampilkanSessionEventSelect() {

    const select =
        document.getElementById(
            "sessionEvent"
        );


    select.innerHTML = "";


    events.forEach(event => {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            event.id;

        option.textContent =
            event.nama;

        select.appendChild(
            option
        );

    });

}


/* =========================================================
   SIMPAN SESSION
========================================================= */

sessionForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();


        const id =
            Number(
                document.getElementById(
                    "sessionId"
                ).value
            );


        const data = {

            eventId:
                Number(
                    document.getElementById(
                        "sessionEvent"
                    ).value
                ),

            nama:
                document.getElementById(
                    "sessionName"
                ).value.trim(),

            lokasi:
                document.getElementById(
                    "sessionLocation"
                ).value.trim(),

            jamMulai:
                document.getElementById(
                    "sessionStart"
                ).value,

            jamSelesai:
                document.getElementById(
                    "sessionEnd"
                ).value,

            xp:
                Number(
                    document.getElementById(
                        "sessionXP"
                    ).value
                ),

            wajibPresensi:
                document.getElementById(
                    "sessionRequired"
                ).checked,

            urutan:
                Number(
                    document.getElementById(
                        "sessionOrder"
                    ).value
                )

        };


        if (id) {

            const session =
                sessions.find(
                    item =>
                        item.id === id
                );


            if (!session) {
                return;
            }


            Object.assign(
                session,
                data
            );

        } else {

            const newId =
                sessions.length
                    ? Math.max(
                        ...sessions.map(
                            item =>
                                item.id
                        )
                    ) + 1
                    : 1;


            sessions.push({

                id: newId,

                ...data,

                status: "DRAFT"

            });

        }


        tutupSessionModal();

        tampilkanSessions();

    }
);


/* =========================================================
   KONFIRMASI TUTUP SESI
========================================================= */

function bukaKonfirmasiTutup(
    session
) {

    sessionToClose =
        session;


    document.getElementById(
        "closeSessionMessage"
    ).textContent =
        `Scanner semua panitia akan langsung terkunci untuk sesi "${session.nama}".`;


    closeSessionConfirm.classList.add(
        "show"
    );

    closeSessionConfirm.setAttribute(
        "aria-hidden",
        "false"
    );

}


function tutupKonfirmasi() {

    closeSessionConfirm.classList.remove(
        "show"
    );

    closeSessionConfirm.setAttribute(
        "aria-hidden",
        "true"
    );


    sessionToClose = null;

}


/* =========================================================
   KONFIRMASI → CLOSED
========================================================= */

document.getElementById(
    "confirmCloseSession"
).addEventListener(
    "click",
    function () {

        if (!sessionToClose) {
            return;
        }


        sessionToClose.status =
            "CLOSED";


        tutupKonfirmasi();

        tampilkanSessions();

    }
);


/* =========================================================
   SESSION EVENT
========================================================= */

eventSelect.addEventListener(
    "change",
    tampilkanSessions
);


/* =========================================================
   EVENT BUTTON
========================================================= */

document.getElementById(
    "addEventButton"
).addEventListener(
    "click",
    () => {

        bukaEventModal();

    }
);


/* =========================================================
   SESSION BUTTON
========================================================= */

document.getElementById(
    "addSessionButton"
).addEventListener(
    "click",
    () => {

        bukaSessionModal();

    }
);


/* =========================================================
   EVENT LIST ACTION
========================================================= */

eventList.addEventListener(
    "click",
    function (event) {

        const button =
            event.target.closest(
                "button[data-action]"
            );


        if (!button) {
            return;
        }


        const id =
            Number(button.dataset.id);


        const action =
            button.dataset.action;


        if (
            action === "edit-event"
        ) {

            const eventData =
                events.find(
                    item =>
                        item.id === id
                );


            if (eventData) {
                bukaEventModal(
                    eventData
                );
            }

        }


        if (
            action === "delete-event"
        ) {

            hapusEvent(id);

        }

    }
);


/* =========================================================
   SESSION LIST ACTION
========================================================= */

sessionList.addEventListener(
    "click",
    function (event) {

        const button =
            event.target.closest(
                "button[data-action]"
            );


        if (!button) {
            return;
        }


        const id =
            Number(button.dataset.id);


        const action =
            button.dataset.action;


        if (
            action === "edit-session"
        ) {

            const session =
                sessions.find(
                    item =>
                        item.id === id
                );


            if (session) {
                bukaSessionModal(
                    session
                );
            }

        }

    }
);


/* =========================================================
   STATUS CHANGE
========================================================= */

sessionList.addEventListener(
    "change",
    function (event) {

        const select =
            event.target.closest(
                'select[data-action="change-status"]'
            );


        if (!select) {
            return;
        }


        const id =
            Number(select.dataset.id);


        const newStatus =
            select.value;


        const session =
            sessions.find(
                item =>
                    item.id === id
            );


        if (!session) {
            return;
        }


        /*
           CLOSED harus melalui
           konfirmasi terlebih dahulu.
        */

        if (
            newStatus === "CLOSED" &&
            session.status !== "CLOSED"
        ) {

            /*
               Kembalikan UI sementara
               ke status sebelumnya.
            */

            select.value =
                session.status;


            bukaKonfirmasiTutup(
                session
            );

            return;
        }


        /*
           ACTIVE / DRAFT
           bisa langsung diubah.
        */

        session.status =
            newStatus;


        tampilkanSessions();

    }
);


/* =========================================================
   CLOSE MODAL BUTTON
========================================================= */

document.getElementById(
    "closeEventModal"
).addEventListener(
    "click",
    tutupEventModal
);


document.getElementById(
    "cancelEventButton"
).addEventListener(
    "click",
    tutupEventModal
);


document.getElementById(
    "closeSessionModal"
).addEventListener(
    "click",
    tutupSessionModal
);


document.getElementById(
    "cancelSessionButton"
).addEventListener(
    "click",
    tutupSessionModal
);


document.getElementById(
    "cancelCloseSession"
).addEventListener(
    "click",
    tutupKonfirmasi
);


/* =========================================================
   KLIK BACKDROP
========================================================= */

[eventModal, sessionModal, closeSessionConfirm]
    .forEach(modal => {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    modal.classList.remove(
                        "show"
                    );

                }

            }
        );

    });


/* =========================================================
   ESC
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key !== "Escape"
        ) {
            return;
        }


        tutupEventModal();

        tutupSessionModal();

        tutupKonfirmasi();

    }
);


/* =========================================================
   INITIAL
========================================================= */

tampilkanEvents();

tampilkanEventSelect();

tampilkanSessions();