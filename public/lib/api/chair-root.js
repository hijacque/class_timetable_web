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

const addCourse = (title) => new Promise((resolve, reject) => $.post(
    "/api/courses/", {name: title},
    (data) => resolve(courseID)
).fail((data) => reject(data)));

const getCurriculum = (courseID) => new Promise((resolve, reject) => {
    $.get("/api/curriculums/" + courseID,
        (data, status) => { resolve(data) }, "json"
    ).fail((data) => console.log(data))
});

const addSemester = (courseID, semData) => $.post(
    "/api/curriculums/" + courseID, semData,
    (data, status) => console.log(data)
).fail((data) => console.log(data));

const addSubject = (courseID, subjData) => new Promise((resolve, reject) => {
    $.post("/api/curriculum/" + courseID, subjData,
        (data) => resolve(data.newSubject)
    ).fail(data => reject(data))
});