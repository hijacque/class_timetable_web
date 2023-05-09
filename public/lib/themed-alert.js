// ! requires mdboostrap CSS and Js files
class ThemedAlert {
    modal;
    alert;
    constructor(modal, id) {
        this.alert = $("#" + id);
        this.modal = modal;
    }

    show(mode, title = "New Message", body = "", redirect) {
        let alertTitle = this.alert.find("#alert-title");
        switch (mode) {
            case 0:
                alertTitle.addClass("text-danger");
                break;
            case 1:
                alertTitle.addClass("text-success");
                break;
            case 2:
                alertTitle.addClass("text-warning");
                break;
            case 3:
                alertTitle.addClass("text-info");
                break;
            default:
                alertTitle.removeClass(
                    "text-danger text-success text-warning text-info"
                );
                break;
        }
        alertTitle.text(title);
        this.alert.find("#alert-body").html(body);
        if (redirect) {
            this.alert.find("#confirm-alert").click(() => location.replace(redirect));
        }

        this.modal.show();
    }
}