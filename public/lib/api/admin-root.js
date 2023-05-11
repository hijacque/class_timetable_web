const getDepartments = (collegeID) => {
    return new Promise((resolve, reject) => {
        $.get("http://localhost:3000/api/departments/" + collegeID,
            (data) => resolve(data.departments), "json"
        ).fail((error) => {
            console.log(error);
            reject(error);
        });
    })
};

const addDepartment = (collegeID, deptData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/departments/" + collegeID, deptData,
    (success) => resolve(success.message),
    "json"
).fail((error) => reject(error)));

const addCollege = (name) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/colleges", { name: name },
    (data) => resolve(data.message),
    "text json"
).fail((error) => reject(error)));

const getFaculty = (departmentID, columns) => new Promise((resolve, reject) => {
    $.get("http://localhost:3000/api/faculty/" + departmentID, { columns: columns },
        (data) => resolve(data.faculty), "json"
    ).fail((data) => reject(data));
});

const updateDepartment = (deptID, newDeptData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/department/" + deptID, newDeptData,
    (data) => resolve(data.message), "json"
).fail(error => reject(error)));

const addFaculty = (deptID, facultyData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/faculty/" + deptID, facultyData,
    (data) => resolve(data.message)
).fail(error => reject(error)));

const getSubjects = (collegeID) => new Promise((resolve, reject) => $.get(
    "http://localhost:3000/api/subjects/" + collegeID,
    (data) => resolve(data.subjects)
).fail((data) => reject(data)));

const addSubject = (collegeID, subjData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/Subjects/" + collegeID, subjData,
    (_, status) => resolve(status)
).fail((data) => reject(data)));

const getRooms = (bldgID) => new Promise((resolve, reject) => {
    $.get("http://localhost:3000/api/rooms/" + bldgID,
        (data, status) => {
            resolve(data.rooms);
        }, "json"
    ).fail((data) => reject(data));
});

const addRoom = (bldgID, roomData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/rooms/" + bldgID, roomData, (_,status) => resolve(status)
).fail(error => reject(error)));

const addBuilding = (name) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/buildings/", { name: name }, (_, status) => resolve(status)
).fail(error => reject(error)));

// const updateFaculty = (deptID, facultyData) => new Promise((resolve, reject) => $.post(
//     "http://localhost:3000/api/faculty-data/" + deptID, facultyData,
//     (data) => resolve(data.message), "json"
// ).fail(error => reject(error)));