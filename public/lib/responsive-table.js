$("a[href^='#']").click((event) => {
    event.preventDefault();
    document.querySelector(event.currentTarget.getAttribute('href')).scrollIntoView({
        behavior: 'smooth'
    });
});

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

        this.headers = $(
            `${table}>thead>tr>[table-cts-column]:not([table-cts-column='edit'], ` +
            `[table-cts-column='delete'], [table-cts-column='edit delete'])`
        ).get();
        $(this.headers).attr("aria-sort", "ascending").click((event) => this.#sortTable(event.currentTarget));
    }

    async initData(data = [], callback = () => {}) {
        $(this.body).empty();
        if (!this.data) {
            this.data = data;
        } else {
            this.data.splice(0, this.data.length, ...data);
        }
    }

    #sortTable(baseColumn) {
        const action = $(`${this.table}>thead>tr> [table-cts-column='edit']`).text();
        if (action && action != "Action") {
            return;
        }
        
        const [key, type, about] = $(baseColumn).attr("table-cts-column").split(" ", 3);
        const columnTitle = baseColumn.textContent;
        const sortType = baseColumn.ariaSort.includes("asc") ? 1 : baseColumn.ariaSort.includes("desc") ? 0 : 2;
        let colIndex = $(baseColumn).index();
        
        if (colIndex < 0) {
            this.showTableAlert(`Could not sort <b>${columnTitle}</b> column.`);
            return;
        }
        
        if (sortType > 0) {
            if (type === "number") {
                this.data.sort((a, b) => b[key] - a[key]);
                this.syncTableData();
            } else {
                this.data.sort((a, b) => a[key].localeCompare(b[key]));
                this.syncTableData();
            }
            $(this.headers).attr("aria-sort", "ascending");
            baseColumn.ariaSort = "descending";
        } else {
            $(this.headers).attr("aria-sort", "ascending");
            if (type === "number") {
                this.data.sort((a, b) => a[key] - b[key]);
                this.syncTableData();
            } else {
                this.data.sort((a, b) => b[key].localeCompare(a[key]));
                this.syncTableData();
            }
        }
    }

    syncTableData() {
        const headers = this.headers;
        const tableRows = $(`${this.body} >tr`).get();
        for (let r = 0; r < this.data.length; r++) {
            const row = this.data[r];
            const columns = tableRows[r].children;
            for (let i = 0; i < headers.length; i++) {
                const [key, type, about] = $(headers[i]).attr("table-cts-column").split(" ", 3);
                let value = row[key];
                if (type == "time") {
                    value = this.formatTime(value);
                } else if (type == "checkbox") {
                    value = `<td>${ value < 1 ? "" : "<i class='fas fa-check fa-lg text-success'></i>" }</td>`;
                } else if (type == "link") {
                    const title = about.split(" ")[0] || headers[i].textContent;
                    value += `<a href='${value}' class='text-decoration-underline'>` +
                        `<i class="fas fa-arrow-up-right-from-square me-2"></i>${title}</a>`;
                }

                columns[i].innerHTML = value;
            }
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
        if (typeof (time) != "string" || !time.includes(":")) {
            return time || "";
        }
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
    footer;
    #editOptions;
    #changeOptions;
    #alwaysOnEdit;
    #inputOptions = ['optional', 'unique'];
    #initCallback;

    addBtn; // for adding new row
    editBtn; // for opening edit view
    saveBtn; // for closing edit view

    editButtons; // edit individual row
    deleteButtons; // delete individual row
    confirmButtons;
    cancelButtons;

    constructor(id, data = [], asyncData = false) {
        super(id);

        const footer = $(`${id}>*>tr.add-data:not(.disabled)`).append(
            `<td class="add-row text-primary"></td>`
        );
        if (footer.length > 0) {
            this.addBtn = $(
                `<a role="button"><i class="fas fa-plus-circle fa-2x"></i></a>`
            ).appendTo(`${id}>*>tr.add-data:not(.disabled)>td.add-row`);
            this.addBtn.click(() => {
                $(this.addBtn).data("newRow", this.addNewRow());
            });
            this.initMenuInputs(footer);
            this.footer = footer;
        }

        const editBtn = $(`[data-cts-toggle='table'][data-cts-target='${id}']`);
        const saveBtn = $(`[data-cts-dismiss='table'][data-cts-target='${id}']`);

        if (editBtn.length > 0 && saveBtn.length > 0) {
            $(`${id}>thead>tr> *:last-child`).hide();
            $(footer).hide();
            this.editBtn = editBtn.click((event) => this.#openEditView(event.currentTarget));
            this.saveBtn = saveBtn.click((event) => this.#closeEditView(event.currentTarget)).hide();
        } else {
            this.#alwaysOnEdit = true;
            this.#openEditView();
        }

        this.#editOptions = `${id}>tbody>tr>td.edit-action> div.edit-options`;
        this.#changeOptions = `${id}>tbody>tr>td.edit-action> div.confirm-options`;
        const actions = $(`${id}>thead>tr> *:last-child:contains(ction)`).attr("table-cts-column").split(" ");
        if (actions.includes("edit")) {
            this.editButtons = `${this.#editOptions}>a.edit`;
        }

        if (actions.includes("delete")) {
            this.deleteButtons = `${this.#editOptions}>a.delete`;
        }

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
            (this.#alwaysOnEdit && !this.footer)) {
            const colSpan = (this.#alwaysOnEdit) ? this.headers.length + 1 : this.headers.length;
            $(this.body).append(
                `<tr><td colspan='${colSpan}' class="text-muted no-data">No data to present</td></tr>`
            );
            return callback();
        } else if (data.length == 0) {
            const colSpan = (this.#alwaysOnEdit) ? this.headers.length + 1 : this.headers.length;
            $(this.body).append(
                `<tr><td colspan='${colSpan}' class="text-muted no-data">No data to present</td></tr>`
            );
            return callback();
        }

        $(this.body).empty();
        const headers = this.headers;
        for (const row of data) {
            let newRow = "<tr>";
            for (let i = 0; i < headers.length; i++) {
                const [key, type, about] = $(headers[i]).attr("table-cts-column").split(" ", 3);
                const value = row[key];
                if (type == "time") {
                    newRow += `<td>${this.formatTime(value)}</td>`;
                } else if (type == "checkbox") {
                    newRow += `<td>${ value < 1 ? "" : "<i class='fas fa-check fa-lg text-success'></i>" }</td>`;
                } else if (type == "link") {
                    const title = about.split(" ")[0] || headers[i].textContent;
                    newRow += `<td><a href='${value}' class='text-decoration-underline'>` +
                        `<i class="fas fa-arrow-up-right-from-square me-2"></i>${title}</a></td>`;
                } else if (value) {
                    newRow += `<td>${value}</td>`;
                } else {
                    newRow += "<td></td>";
                }
            }
            if (this.editButtons || this.deleteButtons) {
                newRow += "<td class='edit-action'><div class='edit-options'>";
                if (this.editButtons) {
                    newRow += "<a class='edit' role='button'><i class='fas fa-edit fa-lg'></i></a>";
                }
                if (this.deleteButtons) {
                    newRow += "<a class='delete' role='button'><i class='far fa-trash-can fa-lg'></i></a>";
                }
                newRow += "</div><div class='confirm-options'><a class='confirm' role='button'>" +
                    "<i class='fas fa-check-circle fa-lg'></i></a><a class='cancel' role='button'>" +
                    "<i class='fas fa-times-circle fa-lg'></i></a></td></tr>";
            }

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

        if (this.editButtons) {
            $(this.editButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:edit"));
        }
        if (this.deleteButtons) {
            $(this.deleteButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:delete"));
        }

        $(this.confirmButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:confirm-change"));
        $(this.cancelButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:cancel-change"));
        
        callback();
    }

    // so convoluted but it just creates a new row which can be from the gui or console
    addNewRow = (data) => new Promise((resolve, reject) => {
        let newData = data;
        const addInputs = $(this.footer).find(".add-td-input").get();

        if (newData) {
            for (let i = 0; i < addInputs.length; i++) {
                let value = addInputs[i].value || addInputs[i].innerHTML;
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
                    const lowerCaseValue = value.toLowerCase();
                    for (let j = 0; j < this.data.length; j++) {
                        if (this.data[j][aboutCol[0]].toLowerCase() == lowerCaseValue) {
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
            newData = {};
            for (let i = 0; i < addInputs.length; i++) {
                let value = addInputs[i].value || addInputs[i].innerHTML;
                const aboutCol = $(this.headers[i]).attr("table-cts-column").split(" ");
                let title = addInputs[i].title || addInputs[i].textContent || this.headers[i].textContent;

                if ($(addInputs[i]).hasClass("optional") && (value == "" || title == value)) {
                    value = null;
                } else if (value == "") {
                    this.showTableAlert(`You left <b>${title}</b> column blank.`);
                    return reject(`input is required in ${title} column`);
                } else if (title == value) {
                    this.showTableAlert(`Pick from the menu in <b>${title}</b> column.`);
                    return reject(`choose an item from menu in ${title} column`);
                } else if ($(addInputs[i]).hasClass("unique")) {
                    const lowerCaseValue = value.toLowerCase();
                    for (let j = 0; j < this.data.length; j++) {
                        if (this.data[j][aboutCol[0]].toLowerCase() == lowerCaseValue) {
                            this.showTableAlert(`New data must be unique, change <b>${title}</b> column`);
                            return reject(`new data must be unique`);
                        }
                    }
                } else if (addInputs[i].type && addInputs[i].type == "number") {
                    value = value.includes(".") ? parseFloat(value) : parseInt(value)
                }

                newData[aboutCol[0]] = value;
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

        const actionCol = $("<td class='edit-action'><div class='edit-options'>" +
            (this.editButtons ? "<a class='edit' role='button'><i class='fas fa-edit fa-lg'></i></a>" : "") +
            (this.deleteButtons ? "<a class='delete' role='button'><i class='far fa-trash-alt fa-lg'></i></a>" : "") +
            "</div></td>"
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

        if (this.editButtons) {
            $(newRow).find("a.edit").click((event) => $(event.currentTarget).closest("tr").trigger("row:edit"));
        }
        if (this.deleteButtons) {
            $(newRow).find("a.delete").click((event) => $(event.currentTarget).closest("tr").trigger("row:delete"));
        }
        
        $(confirmOptions).find("a.confirm").click((event) => $(event.currentTarget).closest("tr").trigger("row:confirm-change"));
        $(confirmOptions).find("a.cancel").click((event) => $(event.currentTarget).closest("tr").trigger("row:cancel-change"));
    });

    #openEditView(editBtn) {
        if (this.#alwaysOnEdit) {
            return;
        }

        $(this.footer).show();
        $(editBtn).prop("disabled", true).hide();
        this.saveBtn.prop("disabled", false).show();
        $(this.table).find("tr.add-data, td.edit-action, thead>tr> *:last-child[table-cts-column]").show();
        if (this.data < 1) {
            $(`${this.body}>tr:has(.no-data)`).hide();
        }
    };

    #closeEditView(saveBtn) {
        const action = $(`${this.table}>thead>tr> *:last-child[table-cts-column]`);
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
        $(this.table).find("tr.add-data, td.edit-action, thead>tr> *:last-child[table-cts-column]").hide();
    }

    #editRow(row) {
        // highlight row to be edited
        $(this.table).removeClass("table-hover");
        $(`${this.body}>tr`).not(row).addClass("text-muted");
        $(row).addClass("table-active").data("action", 1).find("div.confirm-options").show();

        // show confirm options (for saving or cancelling any changes made)
        $(this.#editOptions).hide();
        $(`${this.table}>thead>tr> *:last-child[table-cts-column]`).text("Edit");
        // hide add new row button and disable new row inputs
        $(this.footer).find(".add-td-input").prop("disabled", true);
        $(this.addBtn).prop("disabled", true).hide();
        $(`${this.body} >tr >td:not(.edit-action) >a`).hide();

        const columns = $(row).find("td:not(.edit-action)").empty().get();
        const headers = this.headers;
        const oldData = this.data[$(row).index()];
        for (let i = 0; i < headers.length; i++) {
            const [key, type, about] = $(headers[i]).attr("table-cts-column").split(" ", 3);
            let input;
            const value = oldData[key];
            if (type == "link") {
                continue;
            } else if (type == "checkbox") {
                input = `<input type="checkbox" class="form-check-input td-input" ${(value < 1) ? "" : "checked"}>`;
            } else if (type == "dropdown") {
                let [list, options] = about.split(" ", 2);
                list = list.trim().split(/[\[,\]]/);
                const items = list.filter((val) => val != "" && val.toLowerCase() != "cancel");
                
                input = `<div class='dropdown'><button data-mdb-toggle="dropdown" aria-expanded="false" ` +
                    `class="btn btn-secondary dropdown-toggle td-input ${options ? options : ''}" ` +
                    `title='${headers[i].title}' type='button'>${value ? value : headers[i].title}</button>` +
                    `<ul class='dropdown-menu'>` +
                    (
                        items.length > 0 ? `<li><a class="dropdown-item" role="button">` +
                            `${items.join('</a></li><li><a class="dropdown-item" role="button">')}</a></li>` : ""
                    ) +
                    (
                        list.some((i) => i.toLowerCase() == "cancel") ? "<li><hr class='dropdown-divider m-0'></li>" +
                            "<li><a class='dropdown-item text-danger cancel' role='button' data-cts-reset='dropdown'>Cancel</a>" +
                            "</li>" : ""
                    ) +
                    "</ul></div>";
            } else if (!type || this.#inputOptions.includes(type)) {
                input = `<span class="td-input${about ? about : ""}">${value}</span>`;
            } else if (!value) {
                input = `<input type='${type}' class='form-control td-input'>`;
            } else {
                input = `<input type='${type}' class='form-control td-input' value='${value}'>`;
            }
            $(columns[i]).append(input);
        }
        this.initMenuInputs(row);

        $(row).find(".td-input:first").focus();
        this.initMenuInputs($(row).data("prev-data", ({...oldData})));
    }

    #deleteRow(row) {
        $(this.table).removeClass("table-hover");
        $(this.#editOptions).hide();
        $(`${this.table}>tbody>tr`).not(row).addClass("text-muted");
        $(`${this.table}>thead>tr> *:last-child[table-cts-column]`).text("Delete");
        $(row).addClass("text-danger table-active").data("action", 0).find("div.confirm-options").show();
        $(this.addBtn).prop("disabled", true).hide();
        $(`${this.body}>tr>td>a`).hide();

        $(this.footer).find(".add-td-input").prop("disabled", true);
    }

    #confirmRowChange(updateRow) {
        const actionTitle = $(`${this.table}>thead>tr> *:last-child[table-cts-column]`);
        const action = $(updateRow).data("action");
        $(`${this.body}>tr>td>a`).show();

        if (action == 1) {
            const inputs = $(updateRow).find(".td-input").get();
            const headers = this.headers;
            let updateData = {};
            let validEdit = true;
            for (let i = 0; i < inputs.length; i++) {
                let newValue = inputs[i].value || inputs[i].innerHTML;
                const title = headers[i].title || headers[i].textContent;
                const about = $(headers[i]).attr("table-cts-column");
                const [key, type] = about.split(" ", 3);

                if (type == "link") {
                    continue;
                } else if (type == "checkbox") {
                    newValue = (inputs[i].checked) ? 1 : 0;
                } else if (about.includes("optional") && (!newValue || newValue == "" || title == newValue)) {
                    newValue = null;
                } else if (type == "email" && (!newValue.includes("@") || !newValue.includes("."))) {
                    this.showTableAlert(`Input must include '@' and '.' for column <b>${title}</b>.`);
                    validEdit = false;
                } else if (!newValue || newValue == "") {
                    this.showTableAlert(`You left <b>${title}</b> column blank.`);
                    validEdit = false;
                } else if (title == newValue) {
                    this.showTableAlert(`Pick from the menu in <b>${title}</b> column.`);
                    validEdit = false;
                } else if (about.includes("unique")) {
                    let found = false;
                    for (let j = 0; j < this.data.length; j++) {
                        if (this.data[j][key].toLowerCase() === newValue.toLowerCase()) {
                            if (!found) {
                                found = true;
                            } else {
                                this.showTableAlert(`New data must be unique, change <b>${title}</b> column`);
                                validEdit = false;
                                break;
                            }
                        }
                    }
                } else if (type == "number") {
                    newValue = newValue.includes(".") ? parseFloat(newValue) : parseInt(newValue)
                }

                updateData[key] = newValue;
            }

            if ($(updateRow).data("prev-data") != updateData && validEdit) {
                const rowIndex = $(updateRow).index();
                Object.assign(this.data[rowIndex], updateData);
                for (let i = 0; i < inputs.length; i++) {
                    const [key, type] = $(headers[i]).attr("table-cts-column").split(" ", 3);
                    let newValue = updateData[key];
                    if (type == "link") {
                        continue;
                    } else if (type == "checkbox" && newValue >= 1) {
                        $(inputs[i]).before("<i class='fas fa-check fa-lg text-success'></i>");
                    } else if (type == "time") {
                        $(inputs[i]).before(this.formatTime(newValue));
                    } else if (type == "dropdown" || inputs[i].classList.contains("dropdown-toggle")) {
                        $(inputs[i]).parent("div").before(newValue);
                        inputs[i] = $(inputs[i]).closest(".dropdown");
                    } else if (newValue && newValue != "") {
                        $(inputs[i]).before(newValue);
                    }
                    $(inputs[i]).remove();
                }

                // remove highlight for edited row
                $(this.table).addClass("table-hover");
                $(`${this.body}>tr`).not(updateRow).removeClass("text-muted");
                $(updateRow).removeClass("table-active").find("div.confirm-options").hide();

                // show edit options
                $(this.#editOptions).show();
                actionTitle.text("Action");
                // show add new row button and enable new row inputs
                $(this.footer).find(".add-td-input").prop("disabled", false);
                $(this.addBtn).prop("disabled", false).show();
                $(`${this.body} >tr >td:not(.edit-action) >a`).show();

                $(updateRow).data("updated-data", ({...this.data[rowIndex]}));
                $(this.table).addClass("table-hover");
            }
        } else if (action == 0) {
            $(`${this.table}>tbody>tr`).not(updateRow).removeClass("text-muted").css("background-color", "unset");
            $(this.#editOptions).show();
            $(this.addBtn).prop("disabled", false).show();
            $(this.footer).find(".add-td-input").prop("disabled", false).show();
            const rowIndex = $(updateRow).index();
            this.data.splice(rowIndex, 1);
            $(updateRow).remove();

            $(this.table).addClass("table-hover");
            actionTitle.text("Action");
        }
    }

    #cancelRowChange(row) {
        const actionTitle = $(`${this.table}>thead>tr> *:last-child[table-cts-colum]`);
        const action = $(row).data("action");
        $(`${this.body}>tr>td>a`).show();
        $(this.table).addClass("table-hover");

        if (action == 1) {
            let rowInputs = $(row).find(".td-input").get();
            const oldData = $(row).data("prev-data");
            for (let i = 0; i < rowInputs.length; i++) {
                const [key] = $(this.headers[i]).attr("table-cts-column").split(" ");
                const value = oldData[key];
                if (rowInputs[i].type == "time") {
                    $(rowInputs[i]).before(this.formatTime(value));
                } else if (rowInputs[i].type == "checkbox" && value >= 1) {
                    $(rowInputs[i]).before("<i class='fas fa-check fa-lg text-success'></i>");
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
            $(this.footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
            actionTitle.text("Action");
            $(row).removeData("prev-data");
        } else if (action == 0) {
            $(`${this.body}>tr`).not(row).removeClass("text-muted").css("background-color", "unset");
            $(this.table).find("div.edit-options").show();
            $(this.footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
            actionTitle.text("Action");
            $(row).removeClass("text-danger table-active").find("div.confirm-options").hide();
        }
    }

    initMenuInputs(row) {
        // initialize dropdown menu inputs to show value when clicked
        let dropMenus = $(row).find(".dropdown-toggle").get();

        for (const dropMenuBtn of dropMenus) {
            let dropItems = $(dropMenuBtn).next("ul.dropdown-menu").find(".dropdown-item");

            const origLabel = dropMenuBtn.title || dropMenuBtn.textContent;
            $(dropMenuBtn).on("menu:reset", () => dropMenuBtn.textContent = origLabel);
            dropItems.click((event) => {
                if ($(event.currentTarget).attr("data-cts-reset") == "dropdown") {
                    $(dropMenuBtn).trigger("menu:reset");
                } else {
                    let value = $(event.currentTarget).html();
                    $(dropMenuBtn).val(value);
                    $(dropMenuBtn).html(value);
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