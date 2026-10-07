    //==================Загрузка CSV============================
    // Detect CSV delimiter automatically.
    function detectDelimiter(text) {
        const candidates = [";", ",", "\t", "|"];
        const sample = text.slice(0, Math.min(text.length, 10000));

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
            const response = await fetch("./measures_test.csv");

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


            status.textContent =
                `Loaded ${data.length.toLocaleString()} rows, ` +
                `${Object.keys(data[0] || {}).length} columns, ` +
                `delimiter: ${delimiterName} ` +
                `(${(end - start).toFixed(2)} ms)`;


            // Display parsed data.
            //output.textContent =
                JSON.stringify(data, null, 2);


            // Also print the array to the console.
            console.log("CSV data:", data);

            console.log("First row:", data[0]);

            console.log("Number of rows:", data.length);
            return data;

        }
        catch (error) {

            status.textContent =
                "Error loading CSV: " + error.message;

            output.textContent = "";

            console.error(error);
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

//==============================PDF========================================

/* =========================================================
   PDF — загрузка jsPDF
   ========================================================= */

function loadJsPDF() {

    if (
        window.jspdf &&
        window.jspdf.jsPDF
    ) {
        return Promise.resolve(
            window.jspdf.jsPDF
        );
    }


    return new Promise(
        (resolve, reject) => {

            const existing =
                document.querySelector(
                    'script[data-jspdf="true"]'
                );


            if (existing) {

                existing.addEventListener(
                    "load",
                    () => {

                        if (
                            window.jspdf &&
                            window.jspdf.jsPDF
                        ) {
                            resolve(
                                window.jspdf.jsPDF
                            );
                        }

                        else {
                            reject(
                                new Error(
                                    "jsPDF не найден после загрузки."
                                )
                            );
                        }
                    },
                    { once: true }
                );


                existing.addEventListener(
                    "error",
                    () => {
                        reject(
                            new Error(
                                "Не удалось загрузить jsPDF."
                            )
                        );
                    },
                    { once: true }
                );

                return;
            }


            const script =
                document.createElement("script");

            script.src =
                "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

            script.async = true;

            script.dataset.jspdf = "true";


            script.onload = () => {

                if (
                    window.jspdf &&
                    window.jspdf.jsPDF
                ) {
                    resolve(
                        window.jspdf.jsPDF
                    );
                }

                else {
                    reject(
                        new Error(
                            "jsPDF не найден после загрузки."
                        )
                    );
                }
            };


            script.onerror = () => {

                reject(
                    new Error(
                        "Не удалось загрузить jsPDF. Проверьте интернет-соединение."
                    )
                );
            };


            document.head.appendChild(script);
        }
    );
}

/* =========================================================
   PDF
   ========================================================= */

async function downloadResultsPDF() {

    const button =
        document.getElementById(
            "downloadResultsBtn"
        );

    try {

        const filtered =
            DATA.filter(matchesFilters);

        if (!filtered.length) {

            alert(
                "Нет записей для формирования PDF."
            );

            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Формирование PDF...";
        }

        const jsPDF =
            await loadJsPDF();


        /* =====================================================
           СОЗДАНИЕ PDF
           ===================================================== */

        const pdf =
            new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
                compress: true
            });


        /* =====================================================
           ЗАГРУЗКА ROBOTO
           ===================================================== */

        

        /* =====================================================
           РЕГИСТРАЦИЯ ROBOTO В jsPDF
           ===================================================== */

        

        /* =====================================================
           НАСТРОЙКИ СТРАНИЦЫ
           ===================================================== */

        const PAGE_WIDTH = 210;
        const PAGE_HEIGHT = 297;

        const MARGIN_LEFT = 18;
        const MARGIN_RIGHT = 18;

        const CONTENT_WIDTH =
            PAGE_WIDTH -
            MARGIN_LEFT -
            MARGIN_RIGHT;

        const TOP = 17;
        const BOTTOM = 17;

        const ITEMS_PER_PAGE = 3;


        /* =====================================================
           Безопасное значение
           ===================================================== */

        function getValue(item, key) {

            const value =
                item[key];

            if (
                value === undefined ||
                value === null ||
                String(value).trim() === ""
            ) {
                return "—";
            }

            return String(value);
        }


        /* =====================================================
           Перенос текста
           ===================================================== */

        function wrapText(
            text,
            width,
            fontSize
        ) {

            pdf.setFont(
                "roboto",
                "normal"
            );

            pdf.setFontSize(
                fontSize
            );
            pdf.setFont("Roboto", "normal");
pdf.setFontSize(fontSize);

return pdf.splitTextToSize(
    String(text),
    width
);
            
        }


        /* =====================================================
           Шапка
           ===================================================== */

        function drawHeader() {

            pdf.setFillColor(
                25,
                37,
                48
            );

            pdf.rect(
                0,
                0,
                PAGE_WIDTH,
                10,
                "F"
            );


            pdf.setFillColor(
                40,
                58,
                73
            );

            pdf.roundedRect(
                MARGIN_LEFT,
                TOP,
                13,
                13,
                2,
                2,
                "F"
            );


            pdf.setFont(
                "roboto",
                "bold"
            );

            pdf.setFontSize(10);

            pdf.setTextColor(
                255,
                255,
                255
            );

            pdf.text(
                "М",
                MARGIN_LEFT + 6.5,
                TOP + 8.5,
                {
                    align: "center"
                }
            );


            pdf.setFont(
                "roboto",
                "bold"
            );

            pdf.setFontSize(18);

            pdf.setTextColor(
                25,
                37,
                48
            );

            pdf.text(
                "Дайджест мер поддержки",
                MARGIN_LEFT,
                TOP + 23
            );


            pdf.setFont(
                "roboto",
                "normal"
            );

            pdf.setFontSize(9);

            pdf.setTextColor(
                100,
                110,
                120
            );

            pdf.text(
                "Результат поиска",
                MARGIN_LEFT,
                TOP + 29
            );


            pdf.setDrawColor(
                220,
                225,
                230
            );

            pdf.line(
                MARGIN_LEFT,
                TOP + 34,
                PAGE_WIDTH - MARGIN_RIGHT,
                TOP + 34
            );
        }


        /* =====================================================
           Footer
           ===================================================== */

        function drawFooter(pageNumber) {

            pdf.setDrawColor(
                225,
                228,
                232
            );

            pdf.line(
                MARGIN_LEFT,
                PAGE_HEIGHT - 13,
                PAGE_WIDTH - MARGIN_RIGHT,
                PAGE_HEIGHT - 13
            );


            pdf.setFont(
                "roboto",
                "normal"
            );

            pdf.setFontSize(7.5);

            pdf.setTextColor(
                130,
                135,
                140
            );


            pdf.text(
                "Дайджест мер поддержки",
                MARGIN_LEFT,
                PAGE_HEIGHT - 7
            );


            pdf.text(
                `Страница ${pageNumber}`,
                PAGE_WIDTH - MARGIN_RIGHT,
                PAGE_HEIGHT - 7,
                {
                    align: "right"
                }
            );
        }


        /* =====================================================
           Поля записи
           ===================================================== */

        function getFields(item) {

            return {

                month:
                    getValue(
                        item,
                        "Месяц"
                    ),

                npa:
                    getValue(
                        item,
                        "НПА"
                    ),

                publication:
                    getValue(
                        item,
                        "Дата публикации"
                    ),

                npaDetails:
                    getValue(
                        item,
                        "Реквизиты НПА, регламентирующего поддержку"
                    ),

                title:
                    getValue(
                        item,
                        "Название события (если есть)"
                    ),

                type:
                    getValue(
                        item,
                        "Тип меры поддержки"
                    ),

                kind:
                    getValue(
                        item,
                        "Вид меры поддержки"
                    ),

                sphere:
                    getValue(
                        item,
                        "Отрасль экономики"
                    ),

                operator:
                    getValue(
                        item,
                        "Оператор меры поддержки/инициатор"
                    ),

                recipients:
                    getValue(
                        item,
                        "Получатели меры"
                    ),

                amount:
                    getValue(
                        item,
                        "Размер оказываемой поддержки"
                    ),

                start:
                    getValue(
                        item,
                        "Срок проведения конкурса (начало) /начало действия НПА"
                    ),

                end:
                    getValue(
                        item,
                        "Срок проведения конкурса (окончание)"
                    ),

                link:
                    getValue(
                        item,
                        "Ссылка"
                    )
            };
        }


        /* =====================================================
           Высота карточки
           ===================================================== */

        function getCardHeight(item) {

            const f =
                getFields(item);

            const innerWidth =
                CONTENT_WIDTH - 12;


            const titleLines =
                wrapText(
                    f.title,
                    innerWidth,
                    11
                );


            const rows = [

                `Отрасль экономики: ${f.sphere}`,

                `Тип меры поддержки: ${f.type}`,

                `Вид меры поддержки: ${f.kind}`,

                `Месяц: ${f.month}`,

                `Дата публикации: ${f.publication}`,

                `НПА: ${f.npa}`,

                `Реквизиты НПА: ${f.npaDetails}`,

                `Оператор меры поддержки / инициатор: ${f.operator}`,

                `Получатели меры: ${f.recipients}`,

                `Размер оказываемой поддержки: ${f.amount}`,

                `Начало действия НПА / конкурса: ${f.start}`,

                `Окончание конкурса: ${f.end}`,

                `Источник: ${f.link}`

            ];


            let rowsHeight = 0;


            rows.forEach(row => {

                const lines =
                    wrapText(
                        row,
                        innerWidth,
                        7
                    );

                rowsHeight +=
                    lines.length * 3.2 + 1.1;
            });


            return (
                11 +
                titleLines.length * 4.8 +
                3 +
                rowsHeight +
                7
            );
        }


        /* =====================================================
           Отрисовка карточки
           ===================================================== */

        function drawCard(item, y) {

            const f =
                getFields(item);

            const x =
                MARGIN_LEFT;

            const width =
                CONTENT_WIDTH;

            const height =
                getCardHeight(item);

            const innerX =
                x + 6;

            const innerWidth =
                width - 12;


            pdf.setFillColor(
                247,
                249,
                251
            );

            pdf.roundedRect(
                x,
                y,
                width,
                height,
                2,
                2,
                "F"
            );


            /*
             * Верхняя строка
             */

            pdf.setFont(
                "roboto",
                "normal"
            );

            pdf.setFontSize(7.5);

            pdf.setTextColor(
                90,
                100,
                110
            );


            pdf.text(
                f.sphere,
                innerX,
                y + 7
            );


            pdf.text(
                f.publication,
                x + width - 6,
                y + 7,
                {
                    align: "right"
                }
            );


            /*
             * Заголовок
             */

            let cursorY =
                y + 13;


            pdf.setFont(
                "roboto",
                "bold"
            );

            pdf.setFontSize(11);

            pdf.setTextColor(
                25,
                35,
                45
            );


            const titleLines =
                pdf.splitTextToSize(
                    f.title,
                    innerWidth
                );


            pdf.text(
                titleLines,
                innerX,
                cursorY,
                {
                    lineHeightFactor: 1.12
                }
            );


            cursorY +=
                titleLines.length * 4.8 +
                3;


            /*
             * Данные
             */

            const rows = [

                `Отрасль экономики: ${f.sphere}`,

                `Тип меры поддержки: ${f.type}`,

                `Вид меры поддержки: ${f.kind}`,

                `Месяц: ${f.month}`,

                `Дата публикации: ${f.publication}`,

                `НПА: ${f.npa}`,

                `Реквизиты НПА: ${f.npaDetails}`,

                `Оператор меры поддержки / инициатор: ${f.operator}`,

                `Получатели меры: ${f.recipients}`,

                `Размер оказываемой поддержки: ${f.amount}`,

                `Начало действия НПА / конкурса: ${f.start}`,

                `Окончание конкурса: ${f.end}`,

                `Источник: ${f.link}`

            ];


            pdf.setFont(
                "roboto",
                "normal"
            );

            pdf.setFontSize(7);

            pdf.setTextColor(
                80,
                90,
                100
            );


            rows.forEach(row => {

                const lines =
                    pdf.splitTextToSize(
                        row,
                        innerWidth
                    );


                pdf.text(
                    lines,
                    innerX,
                    cursorY,
                    {
                        lineHeightFactor: 1.1
                    }
                );


                cursorY +=
                    lines.length * 3.2 +
                    1.1;
            });


            return y + height;
        }


        /* =====================================================
           Создание страниц
           ===================================================== */

        let pageNumber = 1;


        for (
            let start = 0;
            start < filtered.length;
            start += ITEMS_PER_PAGE
        ) {

            if (start > 0) {

                pdf.addPage();

                pageNumber++;
            }


            drawHeader();


            const pageItems =
                filtered.slice(
                    start,
                    start + ITEMS_PER_PAGE
                );


            const contentTop =
                TOP + 40;

            const contentBottom =
                PAGE_HEIGHT -
                BOTTOM -
                17;

            const availableHeight =
                contentBottom -
                contentTop;


            const heights =
                pageItems.map(
                    item =>
                        getCardHeight(item)
                );


            const cardsHeight =
                heights.reduce(
                    (sum, height) =>
                        sum + height,
                    0
                );


            const baseGap = 5;

            let gap =
                baseGap;


            if (
                pageItems.length > 1
            ) {

                const freeSpace =
                    availableHeight -
                    cardsHeight -
                    baseGap *
                    (pageItems.length - 1);


                if (freeSpace > 0) {

                    gap =
                        baseGap +
                        freeSpace /
                        (pageItems.length - 1);
                }
            }


            let y =
                contentTop;


            pageItems.forEach(
                (item, index) => {

                    y =
                        drawCard(
                            item,
                            y
                        );


                    if (
                        index <
                        pageItems.length - 1
                    ) {

                        y += gap;
                    }
                }
            );


            drawFooter(
                pageNumber
            );
        }


        /* =====================================================
           Сохранение
           ===================================================== */

        const now =
            new Date();

        const day =
            String(
                now.getDate()
            ).padStart(2, "0");

        const month =
            String(
                now.getMonth() + 1
            ).padStart(2, "0");

        const year =
            now.getFullYear();


        pdf.save(
            `digest-${day}.${month}.${year}.pdf`
        );

    }

    catch (error) {

        console.error(
            "Ошибка формирования PDF:",
            error
        );

        alert(
            "Не удалось сформировать PDF:\n\n" +
            (error?.message || error)
        );
    }

    finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                "Скачать PDF";
        }
    }
}


/* =========================================================
   Кнопка PDF
   ========================================================= */

const downloadResultsBtn =
    document.getElementById(
        "downloadResultsBtn"
    );

if (downloadResultsBtn) {

    downloadResultsBtn.onclick =
        downloadResultsPDF;
    console.log(pdf.getFontList());
} 

//=========================================================================
    //==================Главная функция, запуск страницы============================

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
