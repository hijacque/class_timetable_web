const getDepartments = (collegeID) => new Promise((resolve, reject) => {
    $.get("http://localhost:3000/api/departments/" + collegeID,
        (data) => resolve(data.departments)
    ).fail((error) => reject(error.responseJSON));
});

const addDepartment = (collegeID, deptData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/departments/" + collegeID, deptData,
    (success) => resolve(success.message),
    "json"
).fail((error) => reject(error.responseJSON)));

const addCollege = (name) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/colleges", { name: name },
    (data) => resolve(data.message),
    "text json"
).fail((error) => reject(error.responseJSON)));

const getFaculty = (departmentID, columns) => new Promise((resolve, reject) => {
    $.get("http://localhost:3000/api/faculty/" + departmentID, { columns: columns },
        (data) => resolve(data.faculty)
    ).fail((error) => reject(error.responseJSON));
});

const updateDepartment = (deptID, newDeptData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/department/" + deptID, newDeptData,
    (data) => resolve(data.message)
).fail(error => reject(error.responseJSON)));

const addFaculty = (deptID, facultyData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/faculty/" + deptID, facultyData,
    (data) => resolve(data.message)
).fail(error => reject(error.responseJSON)));

const getSubjects = (collegeID) => new Promise((resolve, reject) => $.get(
    "http://localhost:3000/api/subjects/" + collegeID,
    (data) => resolve(data.subjects)
).fail((error) => reject(error.responseJSON)));

const addSubject = (collegeID, subjData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/Subjects/" + collegeID, subjData,
    (_, status) => resolve(status)
).fail((error) => reject(error.responseJSON)));

const getRooms = (bldgID) => new Promise((resolve, reject) => {
    $.get("http://localhost:3000/api/rooms/" + bldgID,
        (data, status) => {
            resolve(data.rooms);
        }
    ).fail((error) => reject(error.responseJSON));
});

const addRoom = (bldgID, roomData) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/rooms/" + bldgID, roomData, (_,status) => resolve(status)
).fail(error => reject(error.responseJSON)));

const addBuilding = (name) => new Promise((resolve, reject) => $.post(
    "http://localhost:3000/api/buildings/", { name: name }, (_, status) => resolve(status)
).fail(error => reject(error.responseJSON)));

// const updateFaculty = (deptID, facultyData) => new Promise((resolve, reject) => $.post(
//     "http://localhost:3000/api/faculty-data/" + deptID, facultyData,
//     (data) => resolve(data.message)
// ).fail(error => reject(error.responseJSON)));