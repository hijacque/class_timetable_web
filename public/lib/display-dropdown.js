function displayDropMenu(dropMenuBtn, origLabel) {
    let dropList = dropMenuBtn.next("ul.dropdown-menu");
    let dropItems = dropList.find("a.dropdown-item");
    
    dropItems.click((event) => {
        const value = event.currentTarget.textContent;
        if (value.toLowerCase() == "cancel") {
            dropMenuBtn.html(origLabel).val(null);
        } else {
            dropMenuBtn.val(value).text(value);
        }
    });
}