function initValidatePassword(alertModal) {
    const passVisib = $(".toggle-pass").get();
    passVisib.forEach(element => {
        $(element).click(() => {
            let icon = $(element).children();
            $(icon).toggleClass("fa-eye fa-eye-slash");
            let field = $(element).siblings().find("input");

            if ($(field).attr("type") === "password") {
                $(field).attr("type", "textAlert");
            } else {
                $(field).attr("type", "password");
            }
        });
    });

    let alertBody = $("#alert-body");
    let alertTitle = $("#alert-title");
    if ($(alertBody).text() != "") {
        alertModal.show();
    }

    let valid;
    $("#submit").click(() => {
        let password = $("input[name=password]").val();
        if (password) {
            let confirmPass = $("#confirm-pass");
            const lowerCaseLetters = password.match(/[a-z]/g);
            const upperCaseLetters = password.match(/[A-Z]/g);
            const numbers = password.match(/[0-9]/g);
            const specials = password.match(/[.*+?^${}()!@#%|[\]\\]/g);
            let textAlert;
            valid = false;
            if (password.length < 8) {
                textAlert = "Password must be atleast 8 characters long";
            } else if (lowerCaseLetters === null || upperCaseLetters === null || numbers === null || specials === null) {
                textAlert = "Password must have:<br>an upper-case, lower-case, number and special character";
            } else if (confirmPass.length != 0 && $(confirmPass).val() != password) {
                textAlert = "Passwords do not match";
            } else {
                valid = true;
            }

            if (!valid) {
                $(alertTitle).text("Check your password").addClass("text-warning");
                $(alertBody).html(textAlert);
                alertModal.show();
                $("#confirm-pass").val("");
            }
        }
    });

    $("#submit").closest("form").submit((ev) => {
        if (!valid) {
            ev.preventDefault(ev);
        } else {
            $("html").css("cursor", "wait");
            $("#submit").css("cursor", "wait");
            $("input").css("cursor", "wait");
            $("input").prop("readonly", true);
        }
    });
}
