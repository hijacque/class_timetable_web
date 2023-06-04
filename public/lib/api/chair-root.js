const addTerm = (year, semester) => new Promise((resolve) => $.post(
    "/api/terms", { year: year, term: semester },
    (data) => {
        resolve(data.termID);
    }).fail(() => location.reload())
);

const addBlock = (courseID, year, totalStudents, termID) => new Promise((resolve, reject) => {
    $.post("/api/blocks/" + courseID, 
        { year: year, totalStudents: totalStudents, termID: termID },
        (data) => resolve(data)
    ).fail((error) => reject(error.responseJSON))
});

const getSchedules = (termID, category) => new Promise(
    (resolve, reject) => $.get(
        "/api/schedules/" + termID, {category: category}, 
        (data) => resolve(data.schedules)
    ).fail((error) => reject(error))
);

const addCourse = (title) => new Promise((resolve, reject) => $.post(
    "/api/courses/", {name: title},
    (data) => resolve(data.courseID)
).fail((data) => reject(data)));

const getCurriculum = (courseID) => new Promise((resolve, reject) => {
    $.get("/api/curricula/" + courseID, (data) => resolve(data)
    ).fail((error) => reject(error))
});

const addSemester = (courseID, semData) => $.post(
    "/api/curricula/" + courseID, semData, (data) => resolve(data)
).fail((error) => reject(error.responseJSON));

const addCourseSubject = (courseID, subjData) => new Promise((resolve, reject) => {
    $.post("/api/curriculum/" + courseID, subjData,
        (data) => resolve(data.newSubject)
    ).fail(data => reject(data))
});