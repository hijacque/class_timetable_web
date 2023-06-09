function exportToExcel(master = document, filename) {
    /* Get tables element */
    const tables = master.querySelectorAll("table");

    let workbook = XLSX.utils.book_new();
    for (let i = 0; i < tables.length; i++) {
        let newSheet = XLSX.utils.table_to_sheet(tables[i]);
        const title = [...tables].slice(i + 1).some((t) => t.id == tables[i].id) ? `Sheet ${i + 1}` : tables[i].id; 
        XLSX.utils.book_append_sheet(workbook, newSheet, title);
    }

    /* Convert Excel to binary */
    var binaryWorkbook = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });

    /* Create a Blob object for the binary data */
    var xlsxBlob = new Blob([s2ab(binaryWorkbook)], { type: "application/octet-stream" });

    /* Save the Excel file */
    saveAs(xlsxBlob, (filename.slice(-5) == ".xlsx" ? filename : filename + ".xlsx") || "myFile.xlsx");
}

/* Utility function to convert a string to an ArrayBuffer */
function s2ab(s) {
    var buf = new ArrayBuffer(s.length);
    var view = new Uint8Array(buf);
    for (var i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
    return buf;
}