const expandables = $(".expandable").has(".expandable-body").get();
let totaldefaultTitle = 0;
for (const expandable of expandables) {
    let title = $(expandable).find(".expandable-title");
    if (!title) {
        title = $(
            `<a type="button" class="expandable-title" title="Expandable List ${totaldefaultTitle + 1}">` +
            `<i class="fas fa-caret-down"></i><text>Expandable List ${totaldefaultTitle + 1}</text></a>`
        );
        $(expandable).prepend(title);
    } else {
        let name = $(title).text();
        $(title).empty().append(`<i class="fas fa-caret-down"></i><text>${name}</text>`);
    }
    $(title).addClass("text-secondary").click(() => {
        $(expandable).children(".expandable-body").slideToggle(() => $(title).find("i").toggleClass("fa-caret-down fa-caret-right"));
        
    });
}
// console.log(expandables);
// const lists = $("ul.expandable-list");
