function displayDropMenu(dropMenuBtn, origLabel) {
    let dropList = $(dropMenuBtn).next("ul.dropdown-menu");
    let dropItems = $(dropList).find("a.dropdown-item").get();
    dropItems.forEach(item => {
        $(item).click(() => {
            let value = $(item).text();
            if ($(item).text().toLowerCase() == "cancel") {
                $(dropMenuBtn).text(origLabel);
                $(dropMenuBtn).val("");
            } else {
                $(dropMenuBtn).val(value);
                $(dropMenuBtn).text(value);
            }
        });
    });
}