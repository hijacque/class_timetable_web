function displayDropMenu(dropMenuBtn, origLabel) {
    let dropList = dropMenuBtn.next("ul.dropdown-menu");
    let dropItems = dropList.find(".dropdown-item");
    
    dropItems.click((event) => {
        const value = event.currentTarget.textContent.trim();
        if (value.toLowerCase() == "cancel" || $(event.currentTarget).hasClass("cancel")) {
            dropMenuBtn.val(null).text(origLabel);
        } else {
            dropMenuBtn.val(value).text(value);
        }
    });
}