
export async function loadCSV(path) {

    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`Failed to load CSV: ${response.status}`);
    }

    const text = await response.text();

    const rows = [];
    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {

        const char = text[i];
        const next = text[i + 1];

        if (char === '"') {

            if (insideQuotes && next === '"') {
                field += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }

        } else if (char === "," && !insideQuotes) {

            row.push(field);
            field = "";

        } else if ((char === "\n" || char === "\r") && !insideQuotes) {

            if (char === "\r" && next === "\n") {
                i++;
            }

            row.push(field);
            field = "";

            if (row.some(value => value !== "")) {
                rows.push(row);
            }

            row = [];

        } else {

            field += char;
        }
    }

    if (field !== "" || row.length > 0) {

        row.push(field);

        if (row.some(value => value !== "")) {
            rows.push(row);
        }
    }

    if (rows.length === 0) {
        return [];
    }

    const headers = rows[0];

    return rows.slice(1).map(row => {

        const object = {};

        headers.forEach((header, index) => {
            object[header] = row[index] ?? "";
        });

        return object;
    });
}









async function loadCSV(path) {

    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`Failed to load CSV: ${response.status}`);
    }

    const text = await response.text();

    const rows = [];
    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {

        const char = text[i];
        const next = text[i + 1];

        if (char === '"') {

            if (insideQuotes && next === '"') {
                field += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }

        } else if (char === "," && !insideQuotes) {

            row.push(field);
            field = "";

        } else if ((char === "\n" || char === "\r") && !insideQuotes) {

            if (char === "\r" && next === "\n") {
                i++;
            }

            row.push(field);
            field = "";

            if (row.some(value => value !== "")) {
                rows.push(row);
            }

            row = [];

        } else {

            field += char;
        }
    }

    if (field !== "" || row.length > 0) {

        row.push(field);

        if (row.some(value => value !== "")) {
            rows.push(row);
        }
    }

    if (rows.length === 0) {
        return [];
    }

    const headers = rows[0];

    return rows.slice(1).map(row => {

        const object = {};

        headers.forEach((header, index) => {
            object[header] = row[index] ?? "";
        });

        return object;
    });
}
