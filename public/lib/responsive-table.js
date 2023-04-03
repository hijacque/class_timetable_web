$("body").append(
    `<div class="modal fade" id="table-alert" tabindex="-1" aria-labelledby="table-alert-title" ` +
    `aria-hidden="true"><div class="modal-dialog"><div class="modal-content">` +
    `<div class="modal-body" id="table-alert-title">meesage from responsive table</div><div class="modal-footer text-center">` +
    `<button type="button" class="btn btn-secondary" data-mdb-dismiss="modal">ok</button></div></div>` +
    `</div></div>`
);
let tableAlert;
$(document).ready(() => tableAlert = new mdb.Modal($("#table-alert")));

class ResponsiveTable {
    #tableAlert;
    table;
    headers;
    body;

    constructor(table) {
        $(document).ready(() => this.#tableAlert = tableAlert);

        this.table = table;
        this.body = `${table}>tbody`;

        $(table).addClass("table-hover");

        this.headers = $(`${table}>thead>tr>[table-cts-column]:not([table-cts-column='edit'])`).get();
        $(this.headers).attr("aria-sort", "ascending").click((event) => this.#sortTable(event.currentTarget));
        // for (let i = 0; i < this.headers.length; i++) {
        //     if (!this.headers[i].ariaColIndex) {
        //         this.headers[i].ariaColIndex = i;
        //     }
        // // }
        // this.headers.sort((a, b) => a.ariaColIndex - b.ariaColIndex);
    }

    async initData(data = []) {
        $(this.body).empty();
        this.data = data;
    }

    #sortTable(baseColumn) {
        const action = $(`${this.table}>thead>tr> [table-cts-column='edit']`).text();
        if (action && action != "Action") {
            return;
        }

        const aboutCol = $(baseColumn).attr("table-cts-column").split(" ");
        const columnTitle = baseColumn.textContent;
        const sortType = baseColumn.ariaSort.includes("asc") ? 1 : baseColumn.ariaSort.includes("desc") ? 0 : 2;
        let colIndex = $(baseColumn).index();

        if (colIndex < 0) {
            this.showTableAlert(`Could not sort <b>${columnTitle}</b> column.`);
            return;
        }

        const baseColRows = $(`${this.body} > tr > td:nth-child(${colIndex + 1})`).get();
        if (aboutCol[1] === "number") {
            baseColRows.sort((a, b) => {
                let prev = (a.textContent.includes(".")) ? parseFloat(a.textContent) : parseInt(a.textContent) || 0;
                let next = (b.textContent.includes(".")) ? parseFloat(b.textContent) : parseInt(b.textContent) || 0;
                if (sortType > 0) {
                    return next - prev;
                } else {
                    return prev - next;
                }
            });
        } else {
            baseColRows.sort((a, b) => {
                let prev = a.textContent;
                let next = b.textContent;
                if (sortType > 0) {
                    return next.localeCompare(prev);
                } else {
                    return prev.localeCompare(next);
                }
            });
        }

        if (sortType > 0) {
            $(this.headers).attr("aria-sort", "ascending");
            baseColumn.ariaSort = "descending";
        } else {
            $(this.headers).attr("aria-sort", "ascending");
        }

        for (let i = 0; i < baseColRows.length; i++) {
            let row = $(baseColRows[i]).closest("tr");
            $(this.body).prepend(row);
        }
    }

    showTableAlert(message) {
        if (!this.#tableAlert) {
            window.alert(message);
        } else {
            $("#table-alert-title").html(message);
            this.#tableAlert.show();
        }
    }

    formatTime(time) {
        let subTimes = time.split(":");
        let hour = subTimes[0];
        let minutes = subTimes[1];
        let seconds = subTimes[2] || null;

        if (hour <= 12) {
            return (seconds != null) ? `${hour}:${minutes}:${seconds} AM` : `${hour}:${minutes} AM`;
        } else {
            return (seconds != null) ? `${hour - 12}:${minutes}:${seconds} PM` : `${hour - 12}:${minutes} PM`;
        }
    }
}

class EditableTable extends ResponsiveTable {
    #footer;
    #editOptions;
    #changeOptions;
    #alwaysOnEdit;
    addBtn; // for adding new row
    editBtn; // for opening edit view
    saveBtn; // for closing edit view

    editButtons; // edit individual row
    deleteButtons; // delete individual row
    confirmButtons;
    cancelButtons;

    constructor(id, data = [], asyncData = false) {
        super(id);

        const footer = $(`${id}>tfoot>tr.add-data:not(.disabled)`);
        if (footer.length > 0) {
            this.addBtn = $(
                `<td class="add-row text-primary"><a role="button"><i class="fas fa-plus-circle fa-2x"></i></a></td>`
            ).appendTo(footer);
            this.addBtn.click(() => {
                $(this.addBtn).data("newRow", this.addNewRow());
            });
            this.initMenuInputs(footer);
            this.#footer = footer;
        }

        const editBtn = $(`[data-cts-toggle='table'][data-cts-target='${id}']`);
        const saveBtn = $(`[data-cts-dismiss='table'][data-cts-target='${id}']`);

        if (editBtn.length > 0 && saveBtn.length > 0) {
            $("[table-cts-column='edit']").hide();
            $(footer).hide();
            this.editBtn = editBtn.click((event) => this.#openEditView(event.currentTarget));
            this.saveBtn = saveBtn.click((event) => this.#closeEditView(event.currentTarget)).hide();
        } else {
            this.#alwaysOnEdit = true;
            this.#openEditView();
        }

        this.#editOptions = `${id}>tbody>tr>td.edit-action> div.edit-options`;
        this.#changeOptions = `${id}>tbody>tr>td.edit-action> div.confirm-options`;
        this.editButtons = `${this.#editOptions}>a.edit`;
        this.deleteButtons = `${this.#editOptions}>a.delete`;
        this.confirmButtons = `${this.#changeOptions}>a.confirm`;
        this.cancelButtons = `${this.#changeOptions}>a.cancel`;
        this.initData(data, asyncData);
    }
    
    async initData(data = [], asyncData = false, callback = function () { }) {
        if (asyncData) {
            data = await data;
        }
        super.initData(data);
        if (data.length == 0 && $(`${this.table}>thead>tr> [table-cts-column='edit']`).text() == "Action" &&
            (this.#alwaysOnEdit && !this.#footer)) {
            const colSpan = (this.#alwaysOnEdit) ? this.headers.length + 1 : this.headers.length;
            $(this.body).append(
                `<tr><td colspan='${colSpan}' class="text-muted no-data">No data to present</td></tr>`
            );
        }

        const headers = this.headers;
        for (const row of data) {
            let newRow = "<tr>";
            for (let i = 0; i < headers.length; i++) {
                const aboutCol = $(headers[i]).attr("table-cts-column").split(" ", );
                const value = row[aboutCol[0]];
                if (aboutCol[1] == "time") {
                    newRow += `<td>${this.formatTime(value)}</td>`;
                } else if (aboutCol[1] == "link") {
                    const title = $(headers[i]).attr("table-cts-column").split("'")[1] || headers[i].textContent;
                    newRow += `<td><a href='${value}' class='text-decoration-underline'>` +
                        `<i class="fas fa-arrow-up-right-from-square me-2"></i>${title}</a></td>`;
                } else if (value) {
                    newRow += `<td>${value}</td>`;
                } else {
                    newRow += "<td></td>";
                }
            }
            newRow += "<td class='edit-action'><div class='edit-options'>" +
                "<a class='edit' role='button'><i class='fas fa-edit fa-lg'>" +
                "</i></a><a class='delete' role='button'><i class='far fa-trash-alt fa-lg'></i></a></div>" +
                "<div class='confirm-options'><a class='confirm' role='button'>" +
                "<i class='fas fa-check-circle fa-lg'></i></a>" +
                "<a class='cancel' role='button'><i class='fas fa-times-circle fa-lg'></i></a></td></tr>";

            $(this.body).append(newRow);
        }

        if (!this.#alwaysOnEdit) {
            this.saveBtn.trigger("click");
            $(this.table).find("[table-cts-column='edit'], td.edit-action").addClass("text-primary");
        }

        $(this.#changeOptions).hide();

        $(`${this.body}>tr`)
            .on("row:edit", (event) => this.#editRow(event.currentTarget))
            .on("row:delete", (event) => this.#deleteRow(event.currentTarget))
            .on("row:confirm-change", (event) => this.#confirmRowChange(event.currentTarget))
            .on("row:cancel-change", (event) => this.#cancelRowChange(event.currentTarget));

        $(this.editButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:edit"));
        $(this.deleteButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:delete"));
        $(this.confirmButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:confirm-change"));
        $(this.cancelButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:cancel-change"));

        callback();
    }

    // so convoluted but it just creates a new row which can be from the gui or console
    addNewRow = (data) => new Promise((resolve, reject) => {
        let newData = data || {};
        const addInputs = $(this.#footer).find(".add-td-input").get();

        if (jQuery.isEmptyObject(newData)) {
            for (let i = 0; i < addInputs.length; i++) {
                let value = addInputs[i].value || addInputs[i].textContent;
                const aboutCol = $(this.headers[i]).attr("table-cts-column").split(" ");
                let title = this.headers[i].textContent;

                if ($(addInputs[i]).hasClass("optional") && (value == "" || title == value)) {
                    value = null;
                } else if (value == "") {
                    this.showTableAlert(`You left <b>${title}</b> column blank.`);
                    return reject(`input is required in ${title} column`);
                } else if (title == value) {
                    this.showTableAlert(`Pick from the menu in <b>${title}</b> column.`);
                    return reject(`choose an item from menu in ${title} column`);
                } else if ($(addInputs[i]).hasClass("unique")) {
                    for (let j = 0; j < this.data.length; j++) {
                        if (this.data[j][aboutCol[0]] == value) {
                            this.showTableAlert(`New data must be unique, change <b>${title}</b> column`);
                            return reject(`new data must be unique`);
                        }
                    }
                } else if (addInputs[i].type && addInputs[i].type == "number") {
                    value = value.includes(".") ? parseFloat(value) : parseInt(value)
                }

                newData[aboutCol[0]] = value;
            }
        } else {
            for (let i = 0; i < addInputs.length; i++) {
                const title = this.headers[i].textContent;
                const key = $(this.headers[i]).attr("table-cts-column").split(" ")[0];
                const value = newData[key];

                if ($(addInputs[i]).hasClass("optional") && value == "") {
                    return reject(`"${title}" property is blank`);
                } else if ($(addInputs[i]).hasClass("dropdown-toggle")) {
                    const menuItem = $(addInputs[i]).next().find(`a.dropdown-item:not(*[data-cts-reset]):contains("${value}")`);
                    if ($(menuItem).text() != value) {
                        return reject(`"${value}" is not a valid item in ${title} menu`);
                    }
                } else if ($(addInputs[i]).hasClass("unique")) {
                    for (let j = 0; j < this.data.length; j++) {
                        if (this.data[j][key].includes(value)) {
                            return reject(`new data must be unique, change "${title}" property`);
                        }
                    }
                }
            }
        }

        this.data.push(newData);
        resolve(newData);
        $(addInputs).not(".reuse").val(null).trigger("menu:reset");

        let newRow = $("<tr></tr>");
        for (let i = 0; i < addInputs.length; i++) {
            const aboutCol = $(this.headers[i]).attr("table-cts-column").split(" ");
            if (!$(addInputs[i]).hasClass("add-td-input") || ($(addInputs[i]).hasClass("optional") && !newData[aboutCol[0]])) {
                $(newRow).append("<td></td>");
            } else if (aboutCol[1] == "link") {
                const title = $(headers[i]).attr("table-cts-column").split("'")[1] || headers[i].textContent;
                $(newRow).append(
                    `<td><a href='${newData[aboutCol[0]]}' class='text-decoration-underline'>` +
                    `<i class="fas fa-arrow-up-right-from-square me-2"></i>${title}</a></td>`
                );
            } else {
                $(newRow).append(`<td>${newData[aboutCol[0]]}</td>`);
            }
        }

        const actionCol = $("<td class='edit-action'><div class='edit-options'><a class='edit' role='button'>" +
            "<i class='fas fa-edit fa-lg'>" +
            "</i></a><a class='delete' role='button'><i class='far fa-trash-alt fa-lg'></i></a></div></td>"
        ).appendTo(newRow);

        const confirmOptions = $("<div class='confirm-options'><a class='confirm' role='button'>" +
            "<i class='fas fa-check-circle fa-lg'></i></a>" +
            "<a class='cancel' role='button'><i class='fas fa-times-circle fa-lg'></i></a></div>"
        ).hide().appendTo(actionCol);
        $(newRow).find("div.confirm-options").hide();
        $(this.body).append(newRow);

        $(newRow)
            .on("row:edit", (event) => this.#editRow(event.currentTarget))
            .on("row:delete", (event) => this.#deleteRow(event.currentTarget))
            .on("row:confirm-change", (event) => this.#confirmRowChange(event.currentTarget))
            .on("row:cancel-change", (event) => this.#cancelRowChange(event.currentTarget));
        $(newRow).find("a.edit").click((event) => $(event.currentTarget).closest("tr").trigger("row:edit"));
        $(newRow).find("a.delete").click((event) => $(event.currentTarget).closest("tr").trigger("row:delete"));
        $(confirmOptions).find("a.confirm").click((event) => $(event.currentTarget).closest("tr").trigger("row:confirm-change"));
        $(confirmOptions).find("a.cancel").click((event) => $(event.currentTarget).closest("tr").trigger("row:cancel-change"));
    });

    #openEditView(editBtn) {
        if (this.#alwaysOnEdit) {
            return;
        }

        $(this.#footer).show();
        $(editBtn).prop("disabled", true).hide();
        this.saveBtn.prop("disabled", false).show();
        $(this.table).find("tr.add-data, td.edit-action, [table-cts-column='edit']").show();
        if (this.data < 1) {
            $(`${this.body}>tr:has(.no-data)`).hide();
        }
    };

    #closeEditView(saveBtn) {
        const action = $(`${this.table}>thead>tr> [table-cts-column='edit']`);
        if (action.text() != "Action") {
            $(`${this.body}>tr:not(.text-muted):first`).trigger("row:cancel-change");
            action.text("Action");
        }
        if (this.#alwaysOnEdit) {
            return;
        }

        const blankRow = $(`${this.body}>tr:has(.no-data)`);
        if (blankRow.length > 0 && this.data.length < 1) {
            blankRow.show();
        } else if (this.data.length < 1) {
            $(this.body).append(
                `<tr><td colspan='${this.headers.length}' class="text-muted no-data">No data to present</td></tr>`
            );
        } else if (blankRow.length > 0) {
            blankRow.remove();
        }

        $(saveBtn).prop("disabled", true).hide();
        this.editBtn.prop("disabled", false).show();
        $(this.table).find("tr.add-data, td.edit-action, [table-cts-column='edit']").hide();
    }

    #editRow(row) {
        $(this.table).removeClass("table-hover");

        $(this.#editOptions).hide();
        $(`${this.table}>thead>tr> [table-cts-column='edit']`).text("Edit");
        $(`${this.body}>tr`).not(row).addClass("text-muted");
        $(row).addClass("table-active").find("div.confirm-options").show();
        $(this.#footer).find("td.add-row>a").prop("disabled", true).hide();
        $(`${this.body}>tr>td>a`).hide();

        const columns = $(row).find("td").get();
        const inputs = $(this.#footer).find(".add-td-input").get();
        const headers = this.headers;
        let oldData = {};
        for (let i = 0; i < headers.length; i++) {
            let aboutCol = $(headers[i]).attr("table-cts-column").split(" ", 3);
            let input;
            let value = columns[i].textContent;
            if (aboutCol[1] == "link" || !aboutCol[1]) {
                // $(columns[i]).children().hide();
                continue;
            } else if (aboutCol[1] == "dropdown") {
                const list = aboutCol[2].split(/[\[,\]]/).filter(function (val) { return val != "" });
                input = `<div class='dropdown'><button class='btn btn-secondary dropdown-toggle td-input' ` +
                    `type='button' data-mdb-toggle='dropdown' aria-expanded='false'>${value}</button>` +
                    `<ul class='dropdown-menu'><li><a class="dropdown-item" role="button">` +
                    `${list.join('</a></li><li><a class="dropdown-item" role="button">')}</a></li></ul>`;
            } else {
                input = `<input type='${aboutCol[1]}' class='form-control td-input' value='${value}'>`;
            }
            $(columns[i]).empty().append(input);
            oldData[aboutCol[0]] = value;
        }
        
        $(".td-input:first").focus();
        $(inputs).prop("disabled", true);
        this.initMenuInputs($(row).data("prev-data", oldData));
    }

    #deleteRow(row) {
        $(this.table).removeClass("table-hover");
        $(this.#editOptions).hide();
        $(`${this.table}>tbody>tr`).not(row).addClass("text-muted");
        $(`${this.table}>thead>tr> [table-cts-column="edit"]`).text("Delete");
        $(row).addClass("text-danger table-active").find("div.confirm-options").show();
        $(this.#footer).find("td.add-row>a").prop("disabled", true).hide();
        $(`${this.body}>tr>td>a`).hide();

        $(this.#footer).find(".add-td-input").prop("disabled", true);
    }

    #confirmRowChange(updateRow) {
        const action = $(`${this.table}>thead>tr> [table-cts-column="edit"]`);
        $(`${this.body}>tr>td>a`).show();
        $(this.table).addClass("table-hover");

        if (action.text() == "Edit") {
            const rowInputs = $(updateRow).find(".td-input").get();
            let updateData = {};
            let validEdit = true;
            for (let i = 0; i < rowInputs.length; i++) {
                let newValue = $(rowInputs[i]).val() || $(rowInputs[i]).text();
                const title = this.headers[i].textContent;
                const aboutCol = $(this.headers[i]).attr("table-cts-column").split(" ");
                
                if (aboutCol[1] == "link") {
                    continue;
                } else if ($(this.headers[i]).hasClass("optional") && (newValue == "" || title == newValue)) {
                    newValue = null;
                } else if (newValue == "") {
                    this.showTableAlert(`You left <b>${title}</b> column blank.`);
                    validEdit = false;
                } else if (title == newValue) {
                    this.showTableAlert(`Pick from the menu in <b>${title}</b> column.`);
                    validEdit = false;
                } else if ($(this.headers[i]).hasClass("unique")) {
                    const key = aboutCol[i];
                    let found = false;
                    for (let j = 0; j < this.data.length; j++) {
                        if (this.data[j][key] === newValue) {
                            if (!found) {
                                found = true;
                            } else {
                                this.showTableAlert(`New data must be unique, change <b>${title}</b> column`);
                                validEdit = false;
                                break;
                            }
                        }
                    }
                } else if (aboutCol[1] == "number") {
                    newValue = newValue.includes(".") ? parseFloat(newValue) : parseInt(newValue)
                }

                updateData[aboutCol[0]] = newValue;
            }
            if (validEdit) {
                this.data[$(updateRow).index()] = updateData;
                for (let i = 0; i < rowInputs.length; i++) {
                    const aboutCol = $(this.headers[i]).attr("table-cts-column").split(" ", 3);
                    let newValue = updateData[aboutCol[0]];
                    if (aboutCol[1] == "link") {
                        continue;
                    } else if (aboutCol[1] == "time") {
                        $(rowInputs[i]).before(this.formatTime(newValue));
                    } else if (aboutCol[1] == "dropdown" || $(rowInputs[i]).hasClass("dropdown-toggle")) {
                        $(rowInputs[i]).parent("div").before(newValue);
                        rowInputs[i] = $(rowInputs[i]).parent("div");
                    } else {
                        $(rowInputs[i]).before(newValue);
                    }
                    $(rowInputs[i]).remove();
                }

                $(`${this.table}>tbody>tr`).not(updateRow).removeClass("text-muted").css("background-color", "unset");
                $(this.table).find("div.edit-options").show();
                $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();

                $(updateRow).removeClass("table-active").removeData("prev-data").find("div.confirm-options").hide();
                action.text("Action");
            }
        } else if (action.text() == "Delete") {
            $(`${this.table}>tbody>tr`).not(updateRow).removeClass("text-muted").css("background-color", "unset");
            $(this.table).find("div.edit-options").show();
            $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();

            this.data.splice($(updateRow).index(), 1);
            $(updateRow).remove();
            action.text("Action");
        }
    }

    #cancelRowChange(row) {
        const action = $(`${this.table}>thead>tr> [table-cts-column="edit"]`);
        $(`${this.body}>tr>td>a`).show();
        $(this.table).addClass("table-hover");

        if (action.text() == "Edit") {
            let rowInputs = $(row).find(".td-input").get();
            const oldData = $(row).data("prev-data");
            for (let i = 0; i < rowInputs.length; i++) {
                let inputIndex = $("td:has(.td-input)").index();
                const key = $(this.headers[inputIndex]).attr("table-cts-column").split(" ")[0];
                const value = oldData[key];
                if (rowInputs[i].type == "time") {
                    $(rowInputs[i]).before(this.formatTime(value));
                } else if ($(rowInputs[i]).hasClass("dropdown-toggle")) {
                    rowInputs[i] = $(rowInputs[i]).closest("div.dropdown");
                    $(rowInputs[i]).before(value);
                } else {
                    $(rowInputs[i]).before(value);
                }
                $(rowInputs[i]).remove();
            }

            $(`${this.body}>tr`).not(row).removeClass("text-muted");
            $(row).removeClass("table-active").find("div.confirm-options").hide();
            $(this.body).find("div.edit-options").show();
            $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
            action.text("Action");
            $(row).removeData("prev-data");
        } else if (action.text() == "Delete") {
            $(`${this.body}>tr`).not(row).removeClass("text-muted").css("background-color", "unset");
            $(this.table).find("div.edit-options").show();
            $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
            action.text("Action");
            $(row).removeClass("text-danger table-active").find("div.confirm-options").hide();
        }
    }

    initMenuInputs(row) {
        // initialize dropdown menu inputs to show value when clicked
        let dropMenus = $(row).find("button.dropdown-toggle").get();

        for (const dropMenuBtn of dropMenus) {
            let dropList = $(dropMenuBtn).next("ul.dropdown-menu");
            let dropItems = $(dropList).find("a.dropdown-item").get();

            const origLabel = dropMenuBtn.textContent;
            $(dropMenuBtn).on("menu:reset", () => dropMenuBtn.textContent = origLabel);
            $(dropItems).click((event) => {
                if ($(event.currentTarget).attr("data-cts-reset") == "dropdown") {
                    $(dropMenuBtn).trigger("menu:reset");
                } else {
                    let value = $(event.currentTarget).text();
                    $(dropMenuBtn).val(value);
                    $(dropMenuBtn).text(value);
                }
            });
        }
    }
}


class DisplayTable extends ResponsiveTable {
    constructor(id, data = [], asyncData = false) {
        super(id);
        this.initData(data, asyncData);
    }

    async initData(data = [], asyncData = false, callback = function () { }) {
        if (asyncData) {
            data = await data;
        }
        
        super.initData(data);
        if (data.length > 0) {
            const headers = this.headers;
            for (const row of data) {
                let newRow = "<tr>";
                for (let i = 0; i < headers.length; i++) {
                    const aboutCol = $(headers[i]).attr("table-cts-column").split(" ");
                    const value = row[aboutCol[0]];
                    if (aboutCol[1] == "time") {
                        newRow += `<td>${this.formatTime(value)}</td>`;
                    } else if (value) {
                        newRow += `<td>${value}</td>`;
                    } else {
                        newRow += "<td></td>";
                    }
                }
                newRow += "</tr>";

                $(this.body).append(newRow);
            }
        } else {
            $(`${this.body}:not(:has(.no-data))`).append(
                `<tr><td colspan='${this.headers.length}' class="text-muted no-data">No data to present</td></tr>`
            );
        }
        callback();
    }
}