let DATA = [];


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

        const status = document.getElementById("status");
        const output = document.getElementById("output");

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
            output.textContent =
                JSON.stringify(data, null, 2);


            // Also print the array to the console.
            console.log("CSV data:", data);

            console.log("First row:", data[0]);

            console.log("Number of rows:", data.length);

        }
        catch (error) {

            status.textContent =
                "Error loading CSV: " + error.message;

            output.textContent = "";

            console.error(error);
        }
    }


    // Start automatically when page loads.
    loadCSV();






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

//==================Главная функция, запуск страницы============================

async function init() {

    try {

        DATA =
            loadCSV(
                "./measures_test.csv"
            );


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