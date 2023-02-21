class ResponsiveTable {
    #table;
    data;
    #footer;
    #editOptions;
    #changeOptions;
    #isEditing;

    addBtn; // for adding new row
    editBtn; // for opening edit view
    saveBtn; // for closing edit view
    editButtons;
    deleteButtons;
    confirmButtons;
    cancelButtons;

    constructor(id, initialData = []) {
        this.#table = id;
        this.data = initialData;
        this.#footer = `${id}>tfoot>tr.add-data`;
        $(id).removeClass("table-hover");
        $(`${id}>tfoot`).hide();

        const footer = this.#footer;
        $(footer).append(
            `<td class="add-row text-primary"><a role="button"><i class="fas fa-plus-circle fa-2x"></i></a></td>`
        );
        this.#initMenuInputs($(footer));

        if (initialData.length == 0) {
            const headers = $(id).find("th.data-title").get();
            $(id).append(
                `<tr><td colspan='${headers.length}' class="text-muted">No data to present</td></tr>`
            );
        } else {
            const addInputs = $(footer).find(".add-td-input").get();
            for (const row of initialData) {
                let newRow = $("<tr></tr>");
                const rowData = Object.values(row);
                for (let i = 0; i < addInputs.length; i++) {
                    const value = rowData[i];
                    if (addInputs[i].type == "time") {
                        $(newRow).append(`<td>${this.#formatTime(value)}</td>`);
                    } else if (value) {
                        $(newRow).append(`<td>${value}</td>`);
                    } else {
                        $(newRow).append("<td></td>");
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
                $(`${id}>tbody`).append(newRow);
            }

            $(id).find("td.edit-title, td.edit-action").addClass("text-primary").hide();
            $(id).wrap("<div class='table-responsive px-3 pb-2'></div>");
        }

        this.#editOptions = `${id}>tbody>tr>td.edit-action> div.edit-options`;
        this.#changeOptions = `${id}>tbody>tr>td.edit-action> div.confirm-options`;
        $(this.#changeOptions).hide();

        this.editButtons = `${this.#editOptions}>a.edit`;
        this.deleteButtons = `${this.#editOptions}>a.delete`;
        this.confirmButtons = `${this.#changeOptions}>a.confirm`;
        this.cancelButtons = `${this.#changeOptions}>a.cancel`;
        this.editBtn = $(`button[data-cts-toggle='table'][data-cts-target='${id}']`);
        this.saveBtn = $(`button[data-cts-dismiss='table'][data-cts-target='${id}']`);
        $(this.saveBtn).hide();

        $(`${id}>tbody>tr`)
            .on("row:edit", (event) => this.#editRow(event.currentTarget))
            .on("row:delete", (event) => this.#deleteRow(event.currentTarget))
            .on("row:confirm-change", (event) => this.#confirmRowChange(event.currentTarget))
            .on("row:cancel-change", (event) => this.#cancelRowChange(event.currentTarget));

        $(this.editButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:edit"));
        $(this.deleteButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:delete"));
        $(this.confirmButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:confirm-change"));
        $(this.cancelButtons).click((event) => $(event.currentTarget).closest("tr").trigger("row:cancel-change"));

        this.editBtn.click((event) => this.#openEditView(event.currentTarget));
        this.saveBtn.click((event) => this.#closeEditView(event.currentTarget));

        this.addBtn = $(`${footer}>td.add-row>a`).click(() => this.addNewRow());
        this.#isEditing = false;
    }

    addNewRow(dataObject) {
        const addInputs = $(this.#footer).find(".add-td-input").get();
        const newRow = $("<tr></tr>");
        let newData = dataObject || {};
        let validInput = true;
        if (jQuery.isEmptyObject(newData)) {
            console.log(newData);
            for (let i = 0; i < addInputs.length; i++) {
                let value = addInputs[i].value || addInputs[i].textContent;
                newData[addInputs[i].id] = value;
                if (value == "") {
                    window.alert(`You left column ${i + 1} blank.`);
                    validInput = false;
                    break;
                } else if (addInputs[i].title == value) {
                    window.alert(`Pick from the menu in column ${i + 1}.`);
                    validInput = false;
                    break;
                } else if (addInputs[i].type == "time") {
                    $(newRow).append(`<td>${this.#formatTime(value)}</td>`);
                } else if (value) {
                    $(newRow).append(`<td>${value}</td>`);
                } else {
                    $(newRow).append("<td></td>");
                }
            }
        } else {
            for (let i = 0; i < addInputs.length; i++) {
                let value = newData[addInputs[i].id];
                if (value == "") {
                    return `${addInputs[i].id} is blank.`;
                } else if ($(addInputs[i]).hasClass("dropdown-toggle")) {
                    const menuItems =$(addInputs[i]).next().find(`.dropdown-item:not(.dropdown-item[data-cts-reset])`);
                    if (!$.contains(menuItems, value)) {
                        return `${value} is not a valid item in the menu in column ${i + 1}.`;
                    }
                } else if (addInputs[i].type == "time") {
                    $(newRow).append(`<td>${this.#formatTime(value)}</td>`);
                }
                
                if (value) {
                    $(newRow).append(`<td>${value}</td>`);
                } else {
                    $(newRow).append("<td></td>");
                }
            }
        }

        if (validInput) {
            $(addInputs).val(null).trigger("menu:reset");
            this.data.push(newData);
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
            $(newRow)
                .on("row:edit", (event) => this.#editRow(event.currentTarget))
                .on("row:delete", (event) => this.#deleteRow(event.currentTarget))
                .on("row:confirm-change", (event) => this.#confirmRowChange(event.currentTarget))
                .on("row:cancel-change", (event) => this.#cancelRowChange(event.currentTarget));
            $(newRow).find("a.edit").click((event) => $(event.currentTarget).closest("tr").trigger("row:edit"));
            $(newRow).find("a.delete").click((event) => $(event.currentTarget).closest("tr").trigger("row:delete"));
            $(confirmOptions).children("a.confirm").click((event) => $(event.currentTarget).closest("tr").trigger("row:confirm-change"));
            $(confirmOptions).children("a.cancel").click((event) => $(event.currentTarget).closest("tr").trigger("row:cancel-change"));

            $(`${this.#table}>tbody`).append(newRow);
        }
    }

    #openEditView(editBtn) {
        $(editBtn).prop("disabled", true).hide();
        $(this.saveBtn).prop("disabled", false).show();
        $(this.#table).find("tfoot, td.edit-action, td.edit-title").show();
    }

    #closeEditView(saveBtn) {
        const action = $(`${this.#table}>thead>tr>.edit-title`).text();
        if (action != "Action") {
            $(`${this.#table}>tbody>tr>td>div.confirm-options:visible`).closest("tr").trigger("row:cancel-change");
        }
        $(saveBtn).prop("disabled", true).hide();
        $(this.editBtn).prop("disabled", false).show();
        $(this.#table).find("tfoot, td.edit-title, td.edit-action").hide();
    }

    #editRow(row) {
        $(this.#editOptions).hide();
        const title = $(`${this.#table}>thead>tr>td.edit-title`);
        $(`${this.#table}>tbody>tr`).not(row).addClass("text-muted").css("background-color", "#F5F5F5");
        const columns = $(row).find("td").get();
        $(row).addClass("text-center");

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
                newInput = $(newInput).clone().prop("disabled", false).attr("name", `${$(newInput).attr("id")}[]`).toggleClass("add-td-input td-input");
                $(newInput).val($(columns[i]).text());
            }
            $(columns[i]).empty().append(newInput);
        }
        this.#initMenuInputs($(row));
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
        let rowData = this.data;
        let rowKeys = Object.keys(rowData[rowIndex]);

        if (action == "Edit") {
            let rowInputs = $(updateRow).find(".td-input").get();
            let updateData = {};
            let validEdit = true;
            for (let i = 0; i < rowInputs.length; i++) {
                let newValue = $(rowInputs[i]).val() || $(rowInputs[i]).text();
                if (newValue != "") {
                    updateData[rowKeys[i]] = newValue;
                } else {
                    window.alert(`You left column ${i + 1} blank.`);
                    validEdit = false
                    break;
                }
            }
            if (validEdit) {
                rowData[rowIndex] = updateData;
                for (let i = 0; i < rowInputs.length; i++) {
                    let newValue = updateData[rowKeys[i]];
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
                $(updateRow).removeClass("text-center").find("div.confirm-options").hide();
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
            const rowKeys = Object.keys(rowData);
            for (let i = 0; i < rowInputs.length; i++) {
                if ($(rowInputs[i]).attr("type") == "time") {
                    $(rowInputs[i]).before(this.#formatTime(rowData[rowKeys[i]]));
                } else if ($(rowInputs[i]).hasClass("dropdown-toggle")) {
                    rowInputs[i] = $(rowInputs[i]).parent("div");
                    $(rowInputs[i]).before(rowData[rowKeys[i]]);
                } else {
                    $(rowInputs[i]).before(rowData[rowKeys[i]]);
                }
                $(rowInputs[i]).remove();
            }
            $(`${this.#table}>tbody>tr`).not(row).removeClass("text-muted").css("background-color", "unset");
            $(row).removeClass("text-center").find("div.confirm-options").hide();
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

    #initMenuInputs(row) {
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