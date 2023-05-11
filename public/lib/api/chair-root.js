const addTerm = (year, semester) => new Promise((resolve, reject) => $.post(
    "/api/terms", { year: year, term: semester },
    (data, status) => {
        resolve(data.termID);
    }).fail((data) => location.reload())
);

const addBlock = (courseID, year, totalStudents, termID) => new Promise((resolve, reject) => {
    $.post("/api/blocks/" + courseID, 
        { year: year, totalStudents: totalStudents, termID: termID },
        (data) => resolve(data.newBlock)
    ).fail((data) => location.reload())
});

const getSchedules = (termID, category) => new Promise(
    (resolve, reject) => $.get(
        "/api/schedules/" + termID, {category: category}, 
        (data, status) => resolve(data.schedules)
    ).fail((data) => location.load())
);