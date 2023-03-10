$("body").append(
    `<div class="modal fade" id="table-alert" tabindex="-1" aria-labelledby="table-alert-title" ` +
    `aria-hidden="true"><div class="modal-dialog"><div class="modal-content">` +
    `<div class="modal-body" id="table-alert-title">meesage from responsive table</div><div class="modal-footer text-center">` +
    `<button type="button" class="btn btn-secondary" data-mdb-dismiss="modal">ok</button></div></div>` +
    `</div></div>`
);
let alertModal;
$(document).ready(() => alertModal = new mdb.Modal($("#table-alert")));

class ResponsiveTable {
    #table;
    data;
    body;
    #footer;
    #editOptions;
    #changeOptions;
    #isEditing;
    #alertModal;

    addBtn; // for adding new row
    editBtn; // for opening edit view
    saveBtn; // for closing edit view
    editButtons;
    deleteButtons;
    confirmButtons;
    cancelButtons;

    constructor(id) {
        $(document).ready(() => this.#alertModal = alertModal);
        this.#table = id;
        this.#footer = `${id}>tfoot>tr.add-data`;
        this.body = `${id}>tbody`;

        const footer = this.#footer;
        $(id).removeClass("table-hover").find(".edit-title").hide().css("width", "90px");
        $(footer).hide();

        if ($(id).hasClass("editable")) {
            $(footer).append(
                `<td class="add-row text-primary"><a role="button"><i class="fas fa-plus-circle fa-2x"></i></a></td>`
            );
            this.initMenuInputs($(footer));
            this.editBtn = $(`button[data-cts-toggle='table'][data-cts-target='${this.#table}']`);
            this.saveBtn = $(`button[data-cts-dismiss='table'][data-cts-target='${this.#table}']`);
            $(this.saveBtn).hide();

            this.addBtn = $(`${footer}>td.add-row>a`).click(() => {
                $(this.addBtn).data("newRow", this.addNewRow());
            });
            this.editBtn.click((event) => this.#openEditView(event.currentTarget));
            this.saveBtn.click((event) => this.#closeEditView(event.currentTarget));
            this.#isEditing = false;
        }
    }

    async initData(data = [], asyncData = false, callback = function(){}) {
        $(`${this.#table}>tbody`).empty();
        this.data = [];
        if (asyncData) { data = await data; }
        if (data.length == 0) {
            const headers = $(this.#table).find("th.data-title").get();
            $(this.body).append(
                `<tr class="no-data"><td colspan='${headers.length}' class="text-muted">No data to present</td></tr>`
            );
        } else {
            this.data = data;
            const addInputs = $(this.#footer).find(".constant, .add-td-input").get();
            for (const row of data) {
                let newRow = $("<tr></tr>");
                for (let i = 0; i < addInputs.length; i++) {
                    const value = row[addInputs[i].id];
                    if (addInputs[i].type == "time") {
                        $(newRow).append(`<td>${this.#formatTime(value)}</td>`);
                    } else if (value) {
                        $(newRow).append(`<td>${value}</td>`);
                    } else {
                        $(newRow).append("<td></td>");
                    }
                }
                if ($(this.#table).hasClass("editable")) {
                    $(newRow).append(
                        "<td class='edit-action'>" +
                        "<div class='edit-options'><a class='edit' role='button'><i class='fas fa-edit fa-lg'>" +
                        "</i></a><a class='delete' role='button'><i class='far fa-trash-alt fa-lg'></i></a></div>" +
                        "<div class='confirm-options'><a class='confirm' role='button'>" +
                        "<i class='fas fa-check-circle fa-lg'></i></a>" +
                        "<a class='cancel' role='button'><i class='fas fa-times-circle fa-lg'></i></a></td>"
                    );
                }
                $(`${this.#table}>tbody`).append(newRow);
            }
        }
        $(this.#table).find("td.edit-title, td.edit-action").addClass("text-primary").hide();

        this.#editOptions = `${this.#table}>tbody>tr>td.edit-action> div.edit-options`;
        this.#changeOptions = `${this.#table}>tbody>tr>td.edit-action> div.confirm-options`;
        $(this.#changeOptions).hide();

        this.editButtons = `${this.#editOptions}>a.edit`;
        this.deleteButtons = `${this.#editOptions}>a.delete`;
        this.confirmButtons = `${this.#changeOptions}>a.confirm`;
        this.cancelButtons = `${this.#changeOptions}>a.cancel`;

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

    async addData(data, asyncData = false) { }

    // so convoluted but it just creates a new row which can be from the gui or console
    addNewRow = (data) => new Promise((resolve, reject) => {
        let newData = data || {};
        const addInputs = $(this.#footer).find(".constant, .add-td-input").get();

        if (jQuery.isEmptyObject(newData)) {
            for (let i = 0; i < addInputs.length; i++) {
                if ($(addInputs[i]).hasClass("constant")) {
                    continue;
                }

                let value = addInputs[i].value || $(addInputs[i]).text();
                let title = $(addInputs[i]).attr("title");
                const key = addInputs[i].id;
                if (value == "") {
                    this.#showTableAlert(`You left ${title} column blank.`);
                    return reject(`input is required in ${title} column`);
                } else if (title == value) {
                    this.#showTableAlert(`Pick from the menu in ${title} column.`);
                    return reject(`choose an item from menu in ${title} column`);
                } else if ($(addInputs[i]).hasClass("unique")) {
                    for (let j = 0; j < this.data.length; j++) {
                        if (this.data[j][key].includes(value)) {
                            this.#showTableAlert(`New data must be unique, change ${title} column`);
                            return reject(`new data must be unique`);
                        }
                    }
                }
                newData[key] = value;
            }
        } else {
            for (let i = 0; i < addInputs.length; i++) {
                let title = $(addInputs[i]).attr("title");
                let key = addInputs[i].id;
                let value = newData[key];
                if (value == "") {
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
        $(addInputs).val(null).trigger("menu:reset");

        let newRow = $("<tr></tr>");
        for (let i = 0; i < addInputs.length; i++) {
            if (addInputs[i].type == "time") {
                $(newRow).append(`<td>${this.#formatTime(newData[addInputs[i].id])}</td>`);
            } else if ($(addInputs[i]).hasClass("add-td-input")) {
                $(newRow).append(`<td>${newData[addInputs[i].id]}</td>`);
            } else {
                $(newRow).append("<td>*</td>");
            }
        }
        $(newRow).append(
            "<td class='edit-action'>" +
            "<div class='edit-options'><a class='edit' role='button'><i class='fas fa-edit fa-lg'>" +
            "</i></a><a class='delete' role='button'><i class='far fa-trash-alt fa-lg'></i></a></div>" +
            "<div class='confirm-options'><a class='confirm' role='button'>" +
            "<i class='fas fa-check-circle fa-lg'></i></a>" +
            "<a class='cancel' role='button'><i class='fas fa-times-circle fa-lg'></i></a></td>"
        );
        if (!this.#isEditing) {
            $(newRow).find("td.edit-action").hide();
        }
        const confirmOptions = $(newRow).find("div.confirm-options").hide();
        $(this.body).append(newRow);
        $(`${this.body}>tr.no-data`).remove();

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
        this.#isEditing = true;
        $(this.#footer).show();
        $(editBtn).prop("disabled", true).hide();
        $(this.saveBtn).prop("disabled", false).show();
        $(this.#table).find("tr.add-data, td.edit-action, .edit-title").show();
        $(`${this.body}>tr.no-data`).hide();
    }

    #closeEditView(saveBtn) {
        this.#isEditing = false;
        const action = $(`${this.#table}>thead>tr>.edit-title`).text();
        if (action != "Action") {
            $(`${this.#table}>tbody>tr>td>div.confirm-options:visible`).closest("tr").trigger("row:cancel-change");
        }

        let hasBlankRow = $(`${this.body}>tr.no-data`).length > 0;
        if (hasBlankRow && this.data.length < 1) {
            $(`${this.body}>tr.no-data`).show();
        } else if (this.data.length < 1) {
            const headers = $(this.#table).find("th.data-title").get();
            $(this.body).append(
                `<tr class="no-data"><td colspan='${headers.length}' class="text-muted">No data to present</td></tr>`
            );
        } else if (hasBlankRow) {
            $(`${this.body}>tr.no-data`).remove();
        }
        $(saveBtn).prop("disabled", true).hide();
        $(this.editBtn).prop("disabled", false).show();
        $(this.#table).find("tr.add-data, td.edit-title, td.edit-action").hide();
    }

    #editRow(row) {
        $(this.#editOptions).hide();
        const title = $(`${this.#table}>thead>tr>td.edit-title`);
        $(`${this.#table}>tbody>tr`).not(row).addClass("text-muted").css("background-color", "#F5F5F5");
        const columns = $(row).find("td").get();
        $(row).addClass("text-center align-middle");

        $(columns).find("div.confirm-options").show();
        $(title).text("Edit");
        $(this.#footer).find("td.add-row>a").prop("disabled", true).hide();

        const inputs = $(this.#footer).find(".add-td-input").get();
        $(inputs).prop("disabled", true);
        for (let i = 0; i < inputs.length; i++) {
            let newInput = inputs[i];
            if ($(newInput).hasClass("dropdown-toggle")) {
                const menuList = $(inputs[i]).closest("div.dropdown").clone();
                $(menuList).find("button.dropdown-toggle").text($(columns[i]).text()).prop("disabled", false).toggleClass("add-td-input td-input");
                newInput = menuList;
            } else {
                newInput = $(newInput).clone().prop("disabled", false).toggleClass("add-td-input td-input");
                $(newInput).val($(columns[i]).text());
            }
            $(columns[i]).empty().append(newInput);
        }
        this.initMenuInputs($(row));
    }

    #deleteRow(row) {
        $(this.#editOptions).hide();
        $(`${this.#table}>tbody>tr`).not(row).addClass("text-muted").css("background-color", "#F5F5F5");
        const title = $(`${this.#table}>thead>tr>td.edit-title`);
        $(title).text("Delete");
        $(row).addClass("text-danger").find("div.confirm-options").show();
        $(this.#footer).find("td.add-row>a").prop("disabled", true).hide();

        const inputs = $(this.#footer).find(".add-td-input").get();
        $(inputs).prop("disabled", true);
    }

    #confirmRowChange(updateRow) {
        const actionTitle = $(`${this.#table}>thead>tr>.edit-title`);
        const action = $(actionTitle).text();
        let rowIndex = $(updateRow).index();

        if (action == "Edit") {
            let rowInputs = $(updateRow).find(".td-input").get();
            let updateData = {};
            let validEdit = true;
            for (let i = 0; i < rowInputs.length; i++) {
                let newValue = $(rowInputs[i]).val() || $(rowInputs[i]).text();
                if (newValue == "N/A") {
                    updateData[rowInputs[i].id] = "";
                } else if (newValue != "") {
                    updateData[rowInputs[i].id] = newValue;
                } else {
                    this.#showTableAlert(`You left column ${i + 1} blank.`);
                    validEdit = false
                    break;
                }
            }
            if (validEdit) {
                for (const data in updateData) {
                    this.data[rowIndex][data] = updateData[data];
                }
                
                for (let i = 0; i < rowInputs.length; i++) {
                    let newValue = updateData[rowInputs[i].id];
                    if ($(rowInputs[i]).attr("type") == "time") {
                        $(rowInputs[i]).before(this.#formatTime(newValue));
                    } else if ($(rowInputs[i]).hasClass("dropdown-toggle")) {
                        $(rowInputs[i]).parent("div").before(newValue);
                        rowInputs[i] = $(rowInputs[i]).parent("div");
                    } else {
                        $(rowInputs[i]).before(newValue);
                    }
                    $(rowInputs[i]).remove();
                }
                $(`${this.#table}>tbody>tr`).not(updateRow).removeClass("text-muted").css("background-color", "unset");
                $(updateRow).removeClass("text-center align-middle").find("div.confirm-options").hide();
                $(this.#table).find("div.edit-options").show();
                $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
                $(actionTitle).text("Action");
            }
        } else if (action == "Delete") {
            $(`${this.#table}>tbody>tr`).not(updateRow).removeClass("text-muted").css("background-color", "unset");
            $(this.#table).find("div.edit-options").show();
            $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
            $(actionTitle).text("Action");

            this.data.splice(rowIndex, 1);
            $(updateRow).remove();
        }
    }

    #cancelRowChange(row) {
        const actionTitle = $(`${this.#table}>thead>tr>.edit-title`);
        const action = $(actionTitle).text();

        if (action == "Edit") {
            let rowData = this.data[$(row).index()];
            let rowInputs = $(row).find(".td-input").get();
            for (let i = 0; i < rowInputs.length; i++) {
                let oldData = rowData[rowInputs[i].id];
                if ($(rowInputs[i]).attr("type") == "time") {
                    $(rowInputs[i]).before(this.#formatTime(oldData));
                } else if ($(rowInputs[i]).hasClass("dropdown-toggle")) {
                    rowInputs[i] = $(rowInputs[i]).parent("div");
                    $(rowInputs[i]).before(oldData);
                } else {
                    $(rowInputs[i]).before(oldData);
                }
                $(rowInputs[i]).remove();
            }
            $(`${this.#table}>tbody>tr`).not(row).removeClass("text-muted").css("background-color", "unset");
            $(row).removeClass("text-center align-middle").find("div.confirm-options").hide();
            $(this.#table).find("div.edit-options").show();
            $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
            $(actionTitle).text("Action");
        } else if (action == "Delete") {
            $(`${this.#table}>tbody>tr`).not(row).removeClass("text-muted").css("background-color", "unset");
            $(this.#table).find("div.edit-options").show();
            $(this.#footer).find(".add-td-input, td.add-row>a").prop("disabled", false).show();
            $(actionTitle).text("Action");
            $(row).removeClass("text-danger").find("div.confirm-options").hide();
        }
    }

    #showTableAlert(message) {
        if (!this.#alertModal) {
            window.alert(message);
        } else {
            $("#table-alert-title").text(message);
            this.#alertModal.show();
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

    #formatTime(time) {
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