    //==================Загрузка CSV============================
    // Detect CSV delimiter automatically.
    function detectDelimiter(text) {
        const candidates = [";", ",", "\t", "|"];
        // Use only the header row: data rows contain free text with many
        // commas, which used to outweigh the real ";" delimiter.
        const headerEnd = text.search(/\r|\n/);
        const sample = headerEnd === -1
            ? text
            : text.slice(0, headerEnd);

        function countOutsideQuotes(delimiter) {
            let count = 0;
            let insideQuotes = false;

            for (let i = 0; i < sample.length; i++) {
                const char = sample[i];
                const nextChar = sample[i + 1];

                if (char === '"') {
                    if (insideQuotes && nextChar === '"') {
                        i++;
                    } else {
                        insideQuotes = !insideQuotes;
                    }
                }
                else if (char === delimiter && !insideQuotes) {
                    count++;
                }
            }

            return count;
        }

        return candidates.reduce((best, delimiter) => {
            return countOutsideQuotes(delimiter) > countOutsideQuotes(best)
                ? delimiter
                : best;
        }, candidates[0]);
    }


    // Parse CSV text into an array of objects.
    function parseCSV(text, delimiter = null) {

        // Remove UTF-8 BOM.
        text = text.replace(/^\uFEFF/, "");

        // Automatically detect delimiter.
        if (!delimiter) {
            delimiter = detectDelimiter(text);
        }

        const rows = [];
        let row = [];
        let field = "";
        let insideQuotes = false;

        for (let i = 0; i < text.length; i++) {

            const char = text[i];
            const nextChar = text[i + 1];

            // Handle quotes.
            if (char === '"') {

                // Escaped quote: ""
                if (insideQuotes && nextChar === '"') {
                    field += '"';
                    i++;
                }
                else {
                    insideQuotes = !insideQuotes;
                }

                continue;
            }

            // Handle delimiter.
            if (char === delimiter && !insideQuotes) {

                row.push(field);
                field = "";

                continue;
            }

            // Handle line breaks.
            if ((char === "\n" || char === "\r") && !insideQuotes) {

                // Windows CRLF.
                if (char === "\r" && nextChar === "\n") {
                    i++;
                }

                row.push(field);
                field = "";

                // Ignore completely empty rows.
                if (row.some(value => value.trim() !== "")) {
                    rows.push(row);
                }

                row = [];

                continue;
            }

            field += char;
        }

        // Add final field/row.
        if (field !== "" || row.length > 0) {

            row.push(field);

            if (row.some(value => value.trim() !== "")) {
                rows.push(row);
            }
        }

        if (rows.length === 0) {
            return {
                data: [],
                delimiter
            };
        }

        // First row contains column names.
        const headers = rows[0].map((header, index) => {

            let value = header;

            if (index === 0) {
                value = value.replace(/^\uFEFF/, "");
            }

            return value.trim();
        });


        // Convert every row into an object.
        const data = rows.slice(1).map(row => {

            const object = {};

            headers.forEach((header, index) => {
                object[header] = row[index] ?? "";
            });

            return object;
        });


        return {
            data,
            delimiter
        };
    }


    // Load CSV automatically.
    async function loadCSV() {

        try {

            const start = performance.now();

            // CSV must be in the same folder as this HTML file.
            const response = await fetch("data/measures_test.csv");

            if (!response.ok) {
                throw new Error(
                    `Failed to load CSV: HTTP ${response.status}`
                );
            }

            // Read CSV as text.
            const text = await response.text();

            // Parse CSV.
            const result = parseCSV(text);

            // THIS IS YOUR ARRAY.
            const data = result.data;

            // Make it globally accessible.
            window.csvData = data;

            const end = performance.now();

            const delimiterName =
                result.delimiter === ";"
                    ? "semicolon (;)"
                    : result.delimiter === ","
                        ? "comma (,)"
                        : result.delimiter === "\t"
                            ? "tab"
                            : result.delimiter;


            console.log(
                `Loaded ${data.length.toLocaleString()} rows, ` +
                `${Object.keys(data[0] || {}).length} columns, ` +
                `delimiter: ${delimiterName} ` +
                `(${(end - start).toFixed(2)} ms)`
            );


            // Also print the array to the console.
            console.log("CSV data:", data);

            console.log("First row:", data[0]);

            console.log("Number of rows:", data.length);
            return data;

        }
        catch (error) {

            console.error(error);
            throw error;
        }
    }


    //==========================================================================

//=========================Вывод, поиск и фильтрация============================================




const state = {
    query: "",

    spheres: new Set(),

    types: new Set(),

    pubFrom: "",
    pubTo: "",

    startFrom: "",
    startTo: "",

    npa: "",

    selected: null
};



function fmtDate(value) {

    if (!value) {
        return "—";
    }

    return value;
}

function buildChips(
    container,
    values,
    activeSet,
    onToggle
) {
 
    if (!container) {
        return;
    }

    container.innerHTML = "";

    values.forEach(value => {

        const chip =
            document.createElement("button");

        chip.className = "chip";

        chip.textContent = value;

        chip.setAttribute(
            "aria-pressed",
            activeSet.has(value)
                ? "true"
                : "false"
        );

        chip.addEventListener(
            "click",
            () => {

                if (activeSet.has(value)) {
                    activeSet.delete(value);
                }

                else {
                    activeSet.add(value);
                }

                onToggle();
            }
        );

        container.appendChild(chip);
    });
}

/* =========================================================
   Работа с массивами
   ========================================================= */

function uniqueSorted(arr) {

    return [
        ...new Set(
            arr.filter(Boolean)
        )
    ].sort(
        (a, b) =>
            String(a).localeCompare(
                String(b),
                "ru"
            )
    );
}


function matchesFilters(item) {

    const sphere =
        item["Отрасль экономики"] || "";

    const type =
        item["Тип меры поддержки"] || "";

    const publicationDate =
        dateToComparable(
            item["Дата публикации"]
        );

    const startDate =
        dateToComparable(
            item[
                "Срок проведения конкурса (начало) /начало действия НПА"
            ]
        );

    const npa =
        item["НПА"] || "";

    const npaDetails =
        item[
            "Реквизиты НПА, регламентирующего поддержку"
        ] || "";


    /*
     * Отрасль
     */

    if (
        state.spheres.size &&
        !state.spheres.has(sphere)
    ) {
        return false;
    }


    /*
     * Тип меры
     */

    if (
        state.types.size &&
        !state.types.has(type)
    ) {
        return false;
    }


    /*
     * Дата публикации — от
     */

    if (
        state.pubFrom &&
        (
            !publicationDate ||
            publicationDate < state.pubFrom
        )
    ) {
        return false;
    }


    /*
     * Дата публикации — до
     */

    if (
        state.pubTo &&
        (
            !publicationDate ||
            publicationDate > state.pubTo
        )
    ) {
        return false;
    }


    /*
     * Начало действия — от
     */

    if (
        state.startFrom &&
        (
            !startDate ||
            startDate < state.startFrom
        )
    ) {
        return false;
    }


    /*
     * Начало действия — до
     */

    if (
        state.startTo &&
        (
            !startDate ||
            startDate > state.startTo
        )
    ) {
        return false;
    }


    /*
     * НПА
     */

    if (state.npa) {

        const search =
            state.npa.toLowerCase();

        const haystack = (
            npa +
            " " +
            npaDetails
        ).toLowerCase();

        if (
            !haystack.includes(search)
        ) {
            return false;
        }
    }


    /*
     * Общий поиск
     */

    if (state.query) {

        const query =
            state.query.toLowerCase();

        const haystack = [

            item["Месяц"],

            item["Дата публикации"],

            item["НПА"],

            item[
                "Реквизиты НПА, регламентирующего поддержку"
            ],

            item[
                "Название события (если есть)"
            ],

            item["Тип меры поддержки"],

            item["Вид меры поддержки"],

            item["Отрасль экономики"],

            item[
                "Оператор меры поддержки/инициатор"
            ],

            item["Получатели меры"],

            item["Размер оказываемой поддержки"],

            item[
                "Срок проведения конкурса (начало) /начало действия НПА"
            ],

            item[
                "Срок проведения конкурса (окончание)"
            ],

            item["Ссылка"]

        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        if (
            !haystack.includes(query)
        ) {
            return false;
        }
    }


    return true;
}

/* =========================================================
   Работа с датами
   ========================================================= */

function dateToComparable(value) {

    if (!value) {
        return "";
    }

    const text = String(value).trim();

    /*
     * Формат DD.MM.YYYY
     */
    const parts = text.split(".");

    if (parts.length === 3) {

        const day = parts[0].padStart(2, "0");
        const month = parts[1].padStart(2, "0");
        const year = parts[2];

        if (
            /^\d{4}$/.test(year) &&
            /^\d{2}$/.test(day) &&
            /^\d{2}$/.test(month)
        ) {
            return `${year}-${month}-${day}`;
        }
    }

    /*
     * Формат:
     * 6 октября 2026
     */
    const months = {
        января: "01",
        февраля: "02",
        марта: "03",
        апреля: "04",
        мая: "05",
        июня: "06",
        июля: "07",
        августа: "08",
        сентября: "09",
        октября: "10",
        ноября: "11",
        декабря: "12"
    };

    const match = text.match(
        /^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/i
    );

    if (match) {

        const day = match[1].padStart(2, "0");
        const month = months[match[2].toLowerCase()];
        const year = match[3];

        if (month) {
            return `${year}-${month}-${day}`;
        }
    }

    return "";
}


/* =========================================================
   Основной render
   ========================================================= */

function render() {

    const filtered =
        DATA.filter(matchesFilters);


    /*
     * Счётчик
     */
    console.log(filtered);
    const listCount =
        document.getElementById("listCount");

    if (listCount) {
        listCount.textContent =
            `${filtered.length} записей`;
    }


    const topbarMeta =
        document.getElementById("topbarMeta");

    if (topbarMeta) {
        topbarMeta.textContent =
            `${filtered.length} из ${DATA.length} записей`;
    }


    /*
     * Список
     */

    const listEl =
        document.getElementById("listItems");

    if (!listEl) {
        return;
    }

    listEl.innerHTML = "";


    if (!filtered.length) {

        listEl.innerHTML = `
            <div class="empty-msg">
                Ничего не найдено — попробуйте изменить
                условия поиска или сбросить фильтры.
            </div>
        `;

    }


    filtered.forEach(item => {

        const el =
            document.createElement("button");

        const title =
            item[
                "Название события (если есть)"
            ] || "Без названия";

        const sphere =
            item[
                "Отрасль экономики"
            ] || "—";

        const publicationDate =
            item[
                "Дата публикации"
            ] || "—";


        el.className =
            "item" +
            (
                state.selected === item
                    ? " active"
                    : ""
            );


        el.innerHTML = `

            <div class="item-top">

                <span class="stamp">
                    ${sphere}
                </span>

                <span class="item-date">
                    ${publicationDate}
                </span>

            </div>


            <p class="item-title">
                ${title}
            </p>


            <div class="item-meta">

                ${
                    item["Тип меры поддержки"]
                        ? `
                            <span class="tag">
                                ${item["Тип меры поддержки"]}
                            </span>
                        `
                        : ""
                }

                ${
                    item["Вид меры поддержки"]
                        ? `
                            <span class="tag">
                                ${item["Вид меры поддержки"]}
                            </span>
                        `
                        : ""
                }

            </div>


            <p class="item-desc">
                ${
                    item[
                        "Размер оказываемой поддержки"
                    ] || ""
                }
            </p>

        `;


        el.addEventListener(
            "click",
            () => {

                state.selected = item;

                renderDetail(item);

                render();
            }
        );


        listEl.appendChild(el);
    });


    /*
     * Фильтр отраслей
     */

    buildChips(
        document.getElementById("sphereChips"),

        uniqueSorted(
            DATA.map(
                item =>
                    item["Отрасль экономики"]
            )
        ),

        state.spheres,

        render
    );


    /*
     * Фильтр типов
     */

    buildChips(
        document.getElementById("typeChips"),

        uniqueSorted(
            DATA.map(
                item =>
                    item["Тип меры поддержки"]
            )
        ),

        state.types,

        render
    );
}


/* =========================================================
   Детальная информация
   ========================================================= */

function renderDetail(item) {

    const pane =
        document.getElementById("detailPane");

    if (!pane) {
        return;
    }


    const title =
        item[
            "Название события (если есть)"
        ] || "Без названия";

    const npa =
        item["НПА"] || "не указано";

    const npaDetails =
        item[
            "Реквизиты НПА, регламентирующего поддержку"
        ] || "не указано";

    const type =
        item[
            "Тип меры поддержки"
        ] || "—";

    const kind =
        item[
            "Вид меры поддержки"
        ] || "—";

    const publicationDate =
        item[
            "Дата публикации"
        ] || "—";

    const startDate =
        item[
            "Срок проведения конкурса (начало) /начало действия НПА"
        ] || "—";

    const endDate =
        item[
            "Срок проведения конкурса (окончание)"
        ] || "—";

    const sphere =
        item[
            "Отрасль экономики"
        ] || "—";

    const operator =
        item[
            "Оператор меры поддержки/инициатор"
        ] || "—";

    const recipients =
        item[
            "Получатели меры"
        ] || "—";

    const amount =
        item[
            "Размер оказываемой поддержки"
        ] || "—";

    const month =
        item["Месяц"] || "—";

    const link =
        item["Ссылка"] || "#";


    pane.innerHTML = `

        <div class="detail-stamp-row">

            ${
                type !== "—"
                    ? `
                        <span class="stamp">
                            ${type}
                        </span>
                    `
                    : ""
            }

            <span class="tag">
                ${sphere}
            </span>

        </div>


        <h1 class="detail-title">
            ${title}
        </h1>


        <div class="detail-meta">


            <div class="meta-item">

                <div class="k">
                    Месяц
                </div>

                <div class="v">
                    ${month}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Тип меры поддержки
                </div>

                <div class="v">
                    ${type}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Вид меры поддержки
                </div>

                <div class="v">
                    ${kind}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Дата публикации
                </div>

                <div class="v mono">
                    ${publicationDate}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Отрасль экономики
                </div>

                <div class="v">
                    ${sphere}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Срок проведения конкурса /
                    начало действия НПА
                </div>

                <div class="v mono">
                    ${startDate}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Срок проведения конкурса —
                    окончание
                </div>

                <div class="v mono">
                    ${endDate}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    НПА
                </div>

                <div class="v">
                    ${npa}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Реквизиты НПА,
                    регламентирующего поддержку
                </div>

                <div class="v">
                    ${npaDetails}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Оператор меры поддержки /
                    инициатор
                </div>

                <div class="v">
                    ${operator}
                </div>

            </div>


            <div class="meta-item">

                <div class="k">
                    Получатели меры
                </div>

                <div class="v">
                    ${recipients}
                </div>

            </div>


            <div
                class="meta-item"
                style="grid-column:1/-1"
            >

                <div class="k">
                    Размер оказываемой поддержки
                </div>

                <div class="v">
                    ${amount}
                </div>

            </div>


        </div>


        <div class="detail-actions">

            <a
                class="btn btn-primary"
                href="${link}"
                target="_blank"
                rel="noopener"
            >
                Открыть источник ↗
            </a>

        </div>

    `;
}

//==============================Фильтры=================================


/* =========================================================
   Поиск
   ========================================================= */

const searchInput =
    document.getElementById("searchInput");

if (searchInput) {

    searchInput.addEventListener(
        "input",
        e => {

            state.query =
                e.target.value;

            render();
        }
    );
}


/* =========================================================
   Фильтры дат
   ========================================================= */

const pubFrom =
    document.getElementById("pubFrom");

if (pubFrom) {

    pubFrom.addEventListener(
        "change",
        e => {

            state.pubFrom =
                e.target.value;

            render();
        }
    );
}


const pubTo =
    document.getElementById("pubTo");

if (pubTo) {

    pubTo.addEventListener(
        "change",
        e => {

            state.pubTo =
                e.target.value;

            render();
        }
    );
}


const startFrom =
    document.getElementById("startFrom");

if (startFrom) {

    startFrom.addEventListener(
        "change",
        e => {

            state.startFrom =
                e.target.value;

            render();
        }
    );
}


const startTo =
    document.getElementById("startTo");

if (startTo) {

    startTo.addEventListener(
        "change",
        e => {

            state.startTo =
                e.target.value;

            render();
        }
    );
}


/* =========================================================
   Фильтр НПА
   ========================================================= */

const npaFilter =
    document.getElementById("npaFilter");

if (npaFilter) {

    npaFilter.addEventListener(
        "input",
        e => {

            state.npa =
                e.target.value;

            render();
        }
    );
}


/* =========================================================
   Сброс фильтров
   ========================================================= */

const resetFilters =
    document.getElementById("resetFilters");

if (resetFilters) {

    resetFilters.addEventListener(
        "click",
        () => {

            state.spheres.clear();

            state.types.clear();

            state.pubFrom = "";
            state.pubTo = "";

            state.startFrom = "";
            state.startTo = "";

            state.npa = "";

            if (pubFrom) {
                pubFrom.value = "";
            }

            if (pubTo) {
                pubTo.value = "";
            }

            if (startFrom) {
                startFrom.value = "";
            }

            if (startTo) {
                startTo.value = "";
            }

            if (npaFilter) {
                npaFilter.value = "";
            }

            if (searchInput) {
                searchInput.value = "";
                state.query = "";
            }

            render();
        }
    );
}


/* =========================================================
   Мобильные фильтры
   ========================================================= */

const filtersToggle =
    document.getElementById("filtersToggle");

if (filtersToggle) {

    filtersToggle.addEventListener(
        "click",
        () => {

            const filtersPane =
                document.getElementById(
                    "filtersPane"
                );

            if (filtersPane) {
                filtersPane.classList.toggle("open");
            }
        }
    );
}


//==========================================================================

/* =========================================================
   Печать дайджеста через window.print()
   Русский текст отображается системными шрифтами браузера.
   В диалоге печати выберите «Сохранить как PDF».
   ========================================================= */

function downloadResultsPDF() {
    const button = document.getElementById("downloadResultsBtn");
    const printRoot = document.getElementById("printResults");

    try {
        const filtered = DATA.filter(matchesFilters);

        if (!filtered.length) {
            alert("Нет записей для формирования PDF.");
            return;
        }

        if (!printRoot) {
            throw new Error(
                'В index.html не найден элемент <div id="printResults"></div>.'
            );
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Подготовка печати...";
        }

        const value = (item, key) => {
            const v = item?.[key];

            return v === undefined ||
                v === null ||
                String(v).trim() === ""
                ? "—"
                : String(v).trim();
        };

        const escapeHTML = (text) => String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

        const fields = (item) => ({
            month: value(item, "Месяц"),
            npa: value(item, "НПА"),
            publication: value(item, "Дата публикации"),
            npaDetails: value(
                item,
                "Реквизиты НПА, регламентирующего поддержку"
            ),
            title: value(item, "Название события (если есть)"),
            type: value(item, "Тип меры поддержки"),
            kind: value(item, "Вид меры поддержки"),
            sphere: value(item, "Отрасль экономики"),
            operator: value(
                item,
                "Оператор меры поддержки/инициатор"
            ),
            recipients: value(item, "Получатели меры"),
            amount: value(item, "Размер оказываемой поддержки"),
            start: value(
                item,
                "Срок проведения конкурса (начало) /начало действия НПА"
            ),
            end: value(
                item,
                "Срок проведения конкурса (окончание)"
            ),
            link: value(item, "Ссылка")
        });

        const row = (label, text, isLink = false) => {
            const content = isLink && text !== "—"
                ? `<a href="${escapeHTML(text)}">${escapeHTML(text)}</a>`
                : escapeHTML(text);

            return `
                <div class="digest-row">
                    <span class="digest-label">${escapeHTML(label)}:</span>
                    ${content}
                </div>
            `;
        };

        const cards = filtered.map((item) => {
            const f = fields(item);

            return `
                <article class="digest-card">
                    <div class="digest-card-top">
                        <span>${escapeHTML(f.sphere)}</span>
                        <span>${escapeHTML(f.publication)}</span>
                    </div>

                    <h2>${escapeHTML(f.title)}</h2>

                    <div class="digest-card-rows">
                        ${row("Отрасль экономики", f.sphere)}
                        ${row("Тип меры поддержки", f.type)}
                        ${row("Вид меры поддержки", f.kind)}
                        ${row("Месяц", f.month)}
                        ${row("Дата публикации", f.publication)}
                        ${row("НПА", f.npa)}
                        ${row("Реквизиты НПА", f.npaDetails)}
                        ${row(
                            "Оператор меры поддержки / инициатор",
                            f.operator
                        )}
                        ${row("Получатели меры", f.recipients)}
                        ${row("Размер оказываемой поддержки", f.amount)}
                        ${row("Начало действия НПА / конкурса", f.start)}
                        ${row("Окончание конкурса", f.end)}
                        ${row("Источник", f.link, true)}
                    </div>
                </article>
            `;
        }).join("\n");

        const now = new Date();
        const dateLabel = now.toLocaleDateString("ru-RU");
        const oldTitle = document.title;

        document.title = `Дайджест мер поддержки - ${dateLabel}`;

        printRoot.innerHTML = `
            <div class="digest-print-document">
                <header class="digest-print-header">
                    <div class="digest-mark">М</div>
                    <div>
                        <h1>Дайджест мер поддержки</h1>
                        <p>
                            Результат поиска · ${filtered.length} записей ·
                            ${escapeHTML(dateLabel)}
                        </p>
                    </div>
                </header>

                <main class="digest-print-cards">
                    ${cards}
                </main>

                <footer class="digest-print-footer">
                    Дайджест мер поддержки
                </footer>
            </div>
        `;

        let style = document.getElementById("digestPrintStyles");

        if (!style) {
            style = document.createElement("style");
            style.id = "digestPrintStyles";
            document.head.appendChild(style);
        }

        style.textContent = `
            #printResults {
                display: none;
            }

            @media print {
                @page {
                    size: A4;
                    margin: 14mm 13mm 16mm;
                }

                body.digest-printing > *:not(#printResults) {
                    display: none !important;
                }

                body.digest-printing #printResults {
                    display: block !important;
                }

                body.digest-printing #printResults * {
                    box-sizing: border-box;
                }

                body.digest-printing #printResults {
                    color: #192530;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 9pt;
                }

                .digest-print-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid #dce1e6;
                    padding-bottom: 12px;
                    margin-bottom: 16px;
                }

                .digest-mark {
                    width: 38px;
                    height: 38px;
                    flex: 0 0 38px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    background: #283a49;
                    color: #fff;
                    font-size: 20pt;
                    font-weight: 700;
                }

                .digest-print-header h1 {
                    margin: 0 0 4px;
                    font-size: 20pt;
                    line-height: 1.2;
                }

                .digest-print-header p {
                    margin: 0;
                    color: #647078;
                    font-size: 9pt;
                }

                .digest-card {
                    break-inside: avoid;
                    page-break-inside: avoid;
                    border: 1px solid #dce2e8;
                    border-radius: 6px;
                    background: #f7f9fb;
                    padding: 11px 12px;
                    margin: 0 0 12px;
                }

                .digest-card-top {
                    display: flex;
                    justify-content: space-between;
                    gap: 12px;
                    color: #5a646e;
                    font-size: 8pt;
                    margin-bottom: 7px;
                }

                .digest-card h2 {
                    margin: 0 0 9px;
                    font-size: 12pt;
                    line-height: 1.3;
                    overflow-wrap: anywhere;
                }

                .digest-card-rows {
                    display: block;
                }

                .digest-row {
                    margin: 0 0 4px;
                    line-height: 1.35;
                    overflow-wrap: anywhere;
                }

                .digest-label {
                    font-weight: 700;
                }

                .digest-row a {
                    color: #174f83;
                    text-decoration: underline;
                    overflow-wrap: anywhere;
                }

                .digest-print-footer {
                    border-top: 1px solid #dce1e6;
                    margin-top: 16px;
                    padding-top: 7px;
                    color: #82878c;
                    font-size: 8pt;
                }
            }
        `;

        const cleanup = () => {
            document.body.classList.remove("digest-printing");
            document.title = oldTitle;

            if (button) {
                button.disabled = false;
                button.textContent = "Скачать PDF";
            }

            window.removeEventListener("afterprint", cleanup);
        };

        window.addEventListener("afterprint", cleanup, { once: true });

        document.body.classList.add("digest-printing");

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.print();
            });
        });

    } catch (error) {
        console.error("Ошибка подготовки печати:", error);

        alert(
            "Не удалось подготовить печать:\n\n" +
            (error?.message || error)
        );

        if (button) {
            button.disabled = false;
            button.textContent = "Скачать PDF";
        }
    }
}

/* =========================================================
   Кнопка печати / сохранения в PDF
   ========================================================= */

const downloadResultsBtn =
    document.getElementById("downloadResultsBtn");

if (downloadResultsBtn) {
    downloadResultsBtn.onclick = downloadResultsPDF;
}

//=========================================================================
    //==================Главная функция, запуск страницы============================

let DATA = [];

async function init() {

    try {

        DATA =
            await loadCSV();


        console.log(
            "CSV загружен:",
            DATA
        );


        if (!DATA.length) {

            console.warn(
                "CSV загружен, но записей нет."
            );
        }


        render();

    }

    catch (error) {

        console.error(
            "Ошибка загрузки CSV:",
            error
        );


        alert(
            "Не удалось загрузить CSV:\n\n" +
            (
                error?.message ||
                error
            )
        );
    }
}


init();
