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
    (data) => resolve(data.message), "text json"
).fail(error => reject(error)));

const addFaculty = (departmentID, facultyData) => $.post(
    "http://localhost:3000/api/faculty/" + departmentID, facultyData,
    (data, status) => {
        console.log(data.message);
    }, "json"
);