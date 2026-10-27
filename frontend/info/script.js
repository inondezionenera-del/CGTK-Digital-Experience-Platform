const API_BASE_URL = "http://127.0.0.1:8787/api/v1";

const pageTitle = document.getElementById("pageTitle");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const pageContent = document.getElementById("pageContent");
const pageBody = document.getElementById("pageBody");
const notFoundState = document.getElementById("notFoundState");

// Mengambil slug dari URL, misalnya /p/faq
function getSlug() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const pIndex = parts.lastIndexOf("p");

    if (pIndex === -1 || !parts[pIndex + 1]) {
        return null;
    }

    return decodeURIComponent(parts[pIndex + 1]).toLowerCase();
}

// Membuat elemen HTML dengan aman
function createElement(tag, text = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

// Mengatur kondisi halaman
function showState(state) {
    loadingState.hidden = state !== "loading";
    errorState.hidden = state !== "error";
    pageContent.hidden = state !== "success";
    notFoundState.hidden = state !== "not-found";
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

// Menampilkan teks Markdown secara aman
// Mendukung heading, paragraf, daftar, bold, italic, dan link.
function appendInlineMarkdown(container, text) {
    const pattern =
        /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>]+)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;

    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            container.appendChild(
                document.createTextNode(text.slice(lastIndex, match.index))
            );
        }

        if (match[2] && match[3]) {
            const link = document.createElement("a");
            link.textContent = match[2];
            link.href = match[3];
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            container.appendChild(link);
        } else if (match[4]) {
            const link = document.createElement("a");
            const url = match[4].replace(/[.,!?;:]+$/, "");

            link.textContent = url;
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            container.appendChild(link);

            const trailingText = match[4].slice(url.length);

            if (trailingText) {
                container.appendChild(
                    document.createTextNode(trailingText)
                );
            }
        } else if (match[5]) {
            container.appendChild(createElement("strong", match[5]));
        } else if (match[6]) {
            container.appendChild(createElement("em", match[6]));
        } else if (match[7]) {
            container.appendChild(createElement("code", match[7]));
        }

        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
        container.appendChild(
            document.createTextNode(text.slice(lastIndex))
        );
    }
}

// Mengubah Markdown menjadi elemen HTML menggunakan DOM
// tanpa memasukkan string HTML mentah.
function renderMarkdown(markdown, container) {
    container.replaceChildren();

    const lines = String(markdown || "").split(/\r?\n/);
    let paragraphLines = [];
    let listElement = null;

    function flushParagraph() {
        if (paragraphLines.length === 0) return;

        const paragraph = document.createElement("p");
        appendInlineMarkdown(paragraph, paragraphLines.join(" "));
        container.appendChild(paragraph);
        paragraphLines = [];
    }

    function closeList() {
        listElement = null;
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            closeList();
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
            flushParagraph();
            closeList();

            const level = headingMatch[1].length;
            const heading = document.createElement(`h${level}`);

            appendInlineMarkdown(heading, headingMatch[2]);
            container.appendChild(heading);
            continue;
        }

        const listMatch = line.match(/^[-*]\s+(.+)$/);

        if (listMatch) {
            flushParagraph();

            if (!listElement) {
                listElement = document.createElement("ul");
                container.appendChild(listElement);
            }

            const item = document.createElement("li");
            appendInlineMarkdown(item, listMatch[1]);
            listElement.appendChild(item);
            continue;
        }

        if (/^---+$/.test(line)) {
            flushParagraph();
            closeList();
            container.appendChild(document.createElement("hr"));
            continue;
        }

        closeList();
        paragraphLines.push(line);
    }

    flushParagraph();
}

// Mengubah konten FAQ menjadi accordion.
// Setiap heading beserta isi hingga heading berikutnya menjadi satu pertanyaan.
function renderFAQ(markdown, container) {
    container.replaceChildren();

    const lines = String(markdown || "").split(/\r?\n/);
    let currentDetails = null;
    let answerLines = [];

    function flushAnswer() {
        if (!currentDetails || answerLines.length === 0) {
            answerLines = [];
            return;
        }

        const answer = document.createElement("div");
        renderMarkdown(answerLines.join("\n"), answer);
        currentDetails.appendChild(answer);
        answerLines = [];
    }

    for (const line of lines) {
        const headingMatch = line.trim().match(/^#{1,6}\s+(.+)$/);

        if (headingMatch) {
            flushAnswer();

            currentDetails = document.createElement("details");

            const question = createElement("summary", headingMatch[1]);
            currentDetails.appendChild(question);

            container.appendChild(currentDetails);
        } else if (currentDetails) {
            answerLines.push(line);
        } else if (line.trim()) {
            // Konten sebelum pertanyaan pertama tetap ditampilkan.
            const introduction = document.createElement("p");
            appendInlineMarkdown(introduction, line.trim());
            container.appendChild(introduction);
        }
    }

    flushAnswer();

    if (!container.hasChildNodes()) {
        container.appendChild(
            createElement("p", "Belum ada konten FAQ.")
        );
    }
}

// Memuat halaman berdasarkan slug
async function loadPage() {
    const slug = getSlug();

    showState("loading");

    if (!slug || !["faq", "about", "terms"].includes(slug)) {
        showState("not-found");
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/pages/${encodeURIComponent(slug)}`
        );

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("Respons halaman tidak dapat dibaca.");
        }

        if (response.status === 404) {
            showState("not-found");
            return;
        }

        if (!response.ok || result.sukses === false) {
            throw new Error(
                result.error?.pesan ||
                result.pesan ||
                "Gagal memuat halaman."
            );
        }

        const data = result.data ?? result;

        const title = getValue(
            data,
            ["judul", "title"],
            ""
        );

        const content = getValue(
            data,
            ["isi", "content", "konten"],
            null
        );

        if (typeof content !== "string" || !content.trim()) {
            pageTitle.textContent = title || "Halaman Informasi";
            pageBody.replaceChildren();

            showState("success");
            pageBody.appendChild(
                createElement("p", "Konten halaman belum tersedia.")
            );
            return;
        }

        pageTitle.textContent = title || "Halaman Informasi";

        if (slug === "faq") {
            renderFAQ(content, pageBody);
        } else {
            renderMarkdown(content, pageBody);
        }

        showState("success");
    } catch (error) {
        errorState.textContent = error.message;
        showState("error");
    }
}

loadPage();